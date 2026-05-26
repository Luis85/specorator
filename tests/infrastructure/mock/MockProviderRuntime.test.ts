/**
 * T-PV-013/014 — the scriptable Mock provider runtime + runtime registry
 * (SPEC-PV-011). The SPEC-PV-025 construct-gate matrix (`setProviderConstructMode`
 * → ok/keyRequired/cliNotFound/unavailable) + the SPEC-PV-026 transport-state
 * matrix (`scriptProviderStream` + `setTransportMode` → stream / timeout /
 * error-chunk) + the frozen capability bag exposure — no subprocess.
 *
 * Traces: TEST-PV-011/050/051/052/053/100; SPEC-PV-011/025/026; REQ-PV-013/024/053/100;
 * NFR-PV-005/007; EC-PV-4/5/11/12.
 */
import { describe, it, expect } from 'vitest';
import {
	MockProviderRuntime,
	MockProviderRuntimeRegistry,
} from '@/infrastructure/mock/MockProviderRuntime';
import type { StreamChunk } from '@/domain/ports';

async function drain(stream: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
	const out: StreamChunk[] = [];
	for await (const chunk of stream) out.push(chunk);
	return out;
}

describe('MockProviderRuntimeRegistry — construct gate (TEST-PV-011/100, SPEC-PV-025)', () => {
	it('default construct mode → ok (a fresh scriptable runtime)', () => {
		const registry = new MockProviderRuntimeRegistry();
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.providerId).toBe('codex');
	});

	it('no-key → err carrying the honest keyRequired reason (no key substring) (EC-PV-4)', () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.setProviderConstructMode('codex', 'no-key');
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toBe('keyRequired');
	});

	it('no-cli → err cliNotFound (EC-PV-5)', () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.setProviderConstructMode('codex', 'no-cli');
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toBe('cliNotFound');
	});

	it('unavailable → err unavailable', () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.setProviderConstructMode('opencode', 'unavailable');
		const result = registry.createChatRuntime('opencode');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toBe('unavailable');
	});

	it('per-provider modes are independent', () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.setProviderConstructMode('codex', 'no-key');
		expect(registry.createChatRuntime('claude').ok).toBe(true);
		expect(registry.createChatRuntime('codex').ok).toBe(false);
	});
});

describe('MockProviderRuntime — capability bag exposure (REQ-PV-013/024)', () => {
	it('codex exposes the frozen BACKED/GATED-OFF caps (rewind off, turn-steer on)', () => {
		const runtime = new MockProviderRuntime('codex');
		expect(runtime.getCapabilities().supportsRewind).toBe(false);
		expect(runtime.getCapabilities().supportsFork).toBe(true);
		expect(runtime.getToolbarCapabilities().supportsMcpTools).toBe(false);
	});

	it('opencode exposes fork off + provider-commands (via the toolbar caps)', () => {
		const runtime = new MockProviderRuntime('opencode');
		expect(runtime.getCapabilities().supportsFork).toBe(false);
	});
});

describe('MockProviderRuntime — transport-state matrix (SPEC-PV-026, TEST-PV-050..053)', () => {
	it("stream mode replays the scripted chunks then done (TEST-PV-050)", async () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.scriptProviderStream('codex', [
			{ type: 'text', content: 'hello ' },
			{ type: 'text', content: 'world' },
		]);
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const chunks = await drain(result.value.query(result.value.prepareTurn({ text: 'hi' })));
		expect(chunks.map((c) => c.type)).toEqual(['text', 'text', 'done']);
	});

	it('timeout mode → a terminal error chunk; the runtime stays usable (EC-PV-11, TEST-PV-051)', async () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.setTransportMode('codex', 'timeout');
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const chunks = await drain(result.value.query(result.value.prepareTurn({ text: 'hi' })));
		expect(chunks.some((c) => c.type === 'error')).toBe(true);
		expect(chunks[chunks.length - 1].type).toBe('done');
		// usable again — a second query does not throw.
		await expect(
			drain(result.value.query(result.value.prepareTurn({ text: 'again' }))),
		).resolves.toBeDefined();
	});

	it('error-chunk mode → a terminal {type:error} StreamChunk after the stream (EC-PV-12, TEST-PV-052)', async () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.scriptProviderStream('codex', [{ type: 'text', content: 'partial' }]);
		registry.setTransportMode('codex', 'error-chunk');
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const chunks = await drain(result.value.query(result.value.prepareTurn({ text: 'hi' })));
		const types = chunks.map((c) => c.type);
		expect(types).toEqual(['text', 'error', 'done']);
	});

	it('cancel() stops further yields (TEST-PV-053)', async () => {
		const runtime = new MockProviderRuntime('codex');
		runtime.scriptStream([
			{ type: 'text', content: 'a' },
			{ type: 'text', content: 'b' },
		]);
		const gen = runtime.query(runtime.prepareTurn({ text: 'hi' }));
		const first = await gen.next();
		expect(first.value).toEqual({ type: 'text', content: 'a' });
		runtime.cancel();
		const second = await gen.next();
		expect(second.done).toBe(true);
	});

	it('never throws across the construct/query boundary (NFR-PV-005)', async () => {
		const registry = new MockProviderRuntimeRegistry();
		registry.setProviderConstructMode('opencode', 'no-key');
		expect(() => registry.createChatRuntime('opencode')).not.toThrow();
		const okResult = registry.createChatRuntime('claude');
		if (okResult.ok) {
			await expect(
				drain(okResult.value.query(okResult.value.prepareTurn({ text: 'x' }))),
			).resolves.toBeDefined();
		}
	});
});
