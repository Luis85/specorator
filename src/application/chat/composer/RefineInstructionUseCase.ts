import { ok, err, type Result } from '@/domain/shared/Result';
import type { AuxModelPort } from '@/domain/ports';
import {
	buildRefineSystemPrompt,
	parseRefineResponse,
	type RefineOutcome,
} from './instructionRefine';

const REFINE_FAILED_MESSAGE = 'Instruction refine produced no usable result.';

/**
 * RefineInstructionUseCase — a one-shot cold-start aux query (SPEC-CP-015,
 * SPEC-CA-018, ADR-CP-003, ADR-CA-002 §3, REQ-CP-016). P5 re-points this onto the
 * unified `AuxModelPort` — the `prepareTurn` + drain loop are gone; the port's
 * `run` subsumes them (cold-start, never steers the tab's main stream). Behaviour
 * is unchanged: `parseRefineResponse(text)` → `Result.ok(RefineOutcome)`; an aux
 * `err` (error/empty/abort, mapped at the port boundary) or a `null` parse →
 * `Result.err`.
 *
 * Best-effort (REQ-CP-016 `should`): on `err` the caller falls through to the RAW
 * instruction — this use case NEVER surfaces `NotificationPort.showError` and never
 * throws across the boundary (EC-CP-9). No `providerId` branch; no `obsidian`/Vue
 * import.
 */
export class RefineInstructionUseCase {
	constructor(private readonly aux: AuxModelPort) {}

	async execute(rawInstruction: string, existingInstructions: string): Promise<Result<RefineOutcome>> {
		const run = await this.aux.run(rawInstruction, {
			systemPrompt: buildRefineSystemPrompt(existingInstructions),
		});
		if (!run.ok) return err(new Error(REFINE_FAILED_MESSAGE));

		const outcome = parseRefineResponse(run.value);
		if (outcome === null) return err(new Error(REFINE_FAILED_MESSAGE));
		return ok(outcome);
	}
}
