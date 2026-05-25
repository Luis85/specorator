/**
 * T-CA-012 (RED) — `MockBridge.readBinary` (SPEC-CA-008 readBinary leg,
 * TEST-CA-010 Mock leg).
 *
 * The Mock `VaultPort.readBinary` returns seeded bytes from an in-memory map; a
 * missing path REJECTS (the `Result.err` path `AddImageUseCase` wraps in
 * `tryAsync`, T-CA-023). A `seedBinary(path, bytes)` test helper backs the map.
 *
 * Fails until T-CA-013 replaces the throwing `readBinary` stub with the real
 * in-memory read + adds `seedBinary`. No `obsidian`/`node:*`.
 *
 * Traces: TEST-CA-010 (Mock readBinary leg), SPEC-CA-006, SPEC-CA-008, REQ-CA-010,
 * NFR-CA-010.
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

describe('MockBridge.readBinary (TEST-CA-010 Mock leg)', () => {
	it('returns seeded bytes from the in-memory map', async () => {
		const bridge = new MockBridge();
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		bridge.seedBinary('media/a.png', bytes);
		const read = await bridge.readBinary('media/a.png');
		expect(read).toEqual(bytes);
	});

	it('returns the exact bytes (not a re-encoding)', async () => {
		const bridge = new MockBridge();
		const bytes = new Uint8Array([0, 1, 2, 255, 254, 128]);
		bridge.seedBinary('media/raw.gif', bytes);
		const read = await bridge.readBinary('media/raw.gif');
		expect(Array.from(read)).toEqual([0, 1, 2, 255, 254, 128]);
	});

	it('rejects for a missing path (the Result.err path of AddImageUseCase)', async () => {
		const bridge = new MockBridge();
		await expect(bridge.readBinary('media/missing.png')).rejects.toThrow();
	});

	it('is a VaultPort method (readBinary exists on the bridge)', () => {
		const bridge = new MockBridge();
		expect(typeof bridge.readBinary).toBe('function');
	});
});
