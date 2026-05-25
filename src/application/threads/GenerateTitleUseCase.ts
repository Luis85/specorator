import { ok, err, type Result } from '@/domain/shared/Result';
import type { AuxModelPort } from '@/domain/ports';
import {
	TITLE_GENERATION_SYSTEM_PROMPT,
	buildTitleGenerationPrompt,
	parseTitleGenerationResponse,
} from './titleGeneration';

const TITLE_GEN_FAILED_MESSAGE = 'Title generation produced no usable title.';

/**
 * Generate a conversation title via a one-shot cold-start aux query (SPEC-TS-016,
 * SPEC-CA-018, ADR-TS-003, ADR-CA-002 §3, REQ-TS-024/025). P5 re-points this onto
 * the unified `AuxModelPort` — the `prepareTurn` + drain loop are gone; the port's
 * `run` subsumes them (cold-start, never steers the tab's main stream). Behaviour
 * is unchanged: `parseTitleGenerationResponse(text)` → `Result.ok(title)`; an aux
 * `err` (error/empty/abort, mapped at the port boundary) or a `null` parse →
 * `Result.err`. NEVER surfaces `NotificationPort.showError` (REQ-TS-025) — the
 * caller keeps the fallback. `Result`-returning (ADR-004); no `providerId` branch
 * (REQ-TS-026). No `obsidian`/Vue import.
 */
export class GenerateTitleUseCase {
	constructor(private readonly aux: AuxModelPort) {}

	async execute(firstUserMessage: string): Promise<Result<string>> {
		const run = await this.aux.run(buildTitleGenerationPrompt(firstUserMessage), {
			systemPrompt: TITLE_GENERATION_SYSTEM_PROMPT,
		});
		if (!run.ok) return err(new Error(TITLE_GEN_FAILED_MESSAGE));

		const title = parseTitleGenerationResponse(run.value);
		if (title === null) return err(new Error(TITLE_GEN_FAILED_MESSAGE));
		return ok(title);
	}
}
