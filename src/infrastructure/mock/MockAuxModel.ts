import type { AuxModelPort, AuxModelRunOptions } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/**
 * Scriptable Mock `AuxModelPort` (SPEC-CA-008 aux leg) for `npm run dev` + unit
 * tests. The unified one-shot cold-start aux seam the re-pointed title/refine
 * tests (SPEC-CA-018) and the inline-edit tests (SPEC-CA-017) inject instead of a
 * `MockChatRuntime` — same observable behaviour, smaller fake (ADR-CA-002 §3).
 *
 * Scripting (mirrors `MockShellExec`'s `seed` idiom, SPEC-CP-009):
 *   - `setAuxResponse(text)` → `run` resolves `ok(text)` (an empty/whitespace text
 *     maps to `err`, parity with the real impls' empty-accumulated → err);
 *   - `setAuxError()` → `run` resolves `err`;
 *   - `setAuxEmpty()` → `run` resolves `err` (an empty result).
 * An already-aborted `options.signal` → `err` (REQ-CA-027, EC-CA-8). The last
 * `prompt` + `options.systemPrompt` are recorded for assertion. NEVER throws
 * across the boundary (NFR-CA-010). No `obsidian`, no `node:*`, never spawns.
 */
export class MockAuxModel implements AuxModelPort {
	private scripted: Result<string> | null = null;
	private _lastPrompt: string | null = null;
	private _lastSystemPrompt: string | undefined = undefined;

	/** Test hook: the NEXT `run` resolves `ok(text)` (empty/whitespace → err). */
	setAuxResponse(text: string): void {
		this.scripted = text.trim() === '' ? err(new Error('aux model returned no usable text')) : ok(text);
	}

	/** Test hook: the NEXT `run` resolves `err` (a streaming error). */
	setAuxError(): void {
		this.scripted = err(new Error('aux model query failed'));
	}

	/** Test hook: the NEXT `run` resolves `err` (an empty accumulated result). */
	setAuxEmpty(): void {
		this.scripted = err(new Error('aux model returned no usable text'));
	}

	/** The last `prompt` passed to `run` (for assertion). */
	get lastPrompt(): string | null {
		return this._lastPrompt;
	}

	/** The last `options.systemPrompt` passed to `run` (for assertion). */
	get lastSystemPrompt(): string | undefined {
		return this._lastSystemPrompt;
	}

	run(prompt: string, options?: AuxModelRunOptions): Promise<Result<string>> {
		this._lastPrompt = prompt;
		this._lastSystemPrompt = options?.systemPrompt;
		if (options?.signal?.aborted === true) {
			return Promise.resolve(err(new Error('aux model query aborted')));
		}
		// Unscripted defaults to err — a side-query with no canned response is a
		// failure, never an unguarded throw (NFR-CA-010).
		return Promise.resolve(this.scripted ?? err(new Error('aux model returned no usable text')));
	}
}
