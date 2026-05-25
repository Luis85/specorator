import { ok, err, type Result } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { ChatRuntimePort } from '@/domain/ports';
import {
	buildRefineSystemPrompt,
	parseRefineResponse,
	type RefineOutcome,
} from './instructionRefine';

/** The accumulated outcome of the cold-start refine side-query stream. */
interface RefineStreamOutcome {
	text: string;
	errored: boolean;
}

const REFINE_FAILED_MESSAGE = 'Instruction refine produced no usable result.';

/**
 * RefineInstructionUseCase — the cold-start refine side-query (SPEC-CP-015,
 * ADR-CP-003, REQ-CP-016). Mirrors `GenerateTitleUseCase` (SPEC-TS-016): builds the
 * one-shot prepared turn from `buildRefineSystemPrompt`, drives
 * `runtime.query(turn, [], { forceColdStart: true })` so the side-query ignores any
 * bound session and does NOT steer the tab's main stream, accumulates `text` chunks
 * (tool/thinking ignored), `done` terminates. `parseRefineResponse` →
 * `Result.ok(RefineOutcome)`; a `null` parse or an `error` chunk → `Result.err`
 * (the error-as-chunk mapped to a `Result` at this boundary, ADR-CC-001 §2).
 *
 * Best-effort (REQ-CP-016 `should`): on `err` the caller falls through to the RAW
 * instruction — this use case NEVER surfaces `NotificationPort.showError` and never
 * throws across the boundary (EC-CP-9). Provider-addressed via `getCapabilities()`;
 * the runtime gains NO refine-specific member (reuses `query`, NFR-CP-009). No
 * `providerId` branch; no `obsidian`/Vue import.
 */
export class RefineInstructionUseCase {
	constructor(private readonly runtime: ChatRuntimePort) {}

	async execute(rawInstruction: string, existingInstructions: string): Promise<Result<RefineOutcome>> {
		// The refine system prompt frames the one-shot request; P3's ChatTurnRequest
		// carries only `text`, so the framed prompt + the raw instruction is the turn
		// text (no invented domain field), matching GenerateTitleUseCase.
		const prepared = this.runtime.prepareTurn({
			text: `${buildRefineSystemPrompt(existingInstructions)}\n\n${rawInstruction}`,
		});

		const drained = await tryAsync(() => this.accumulate(prepared));
		if (!drained.ok) {
			// An unexpected generator throw becomes a Result, never crosses the boundary.
			return err(drained.error);
		}

		const { text, errored } = drained.value;
		if (errored) return err(new Error(REFINE_FAILED_MESSAGE));

		const outcome = parseRefineResponse(text);
		if (outcome === null) return err(new Error(REFINE_FAILED_MESSAGE));
		return ok(outcome);
	}

	/** Drain the cold-start side-query, accumulating `text`; stop on `done`. */
	private async accumulate(
		prepared: ReturnType<ChatRuntimePort['prepareTurn']>,
	): Promise<RefineStreamOutcome> {
		let text = '';
		let errored = false;
		for await (const chunk of this.runtime.query(prepared, [], { forceColdStart: true })) {
			if (chunk.type === 'text') {
				text += chunk.content;
			} else if (chunk.type === 'error') {
				errored = true;
			} else if (chunk.type === 'done') {
				break;
			}
			// tool/thinking/usage and any other member are ignored for refine.
		}
		return { text, errored };
	}
}
