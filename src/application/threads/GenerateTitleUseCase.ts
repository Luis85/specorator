import { ok, err, type Result } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { ChatRuntimePort } from '@/domain/ports';
import {
	TITLE_GENERATION_SYSTEM_PROMPT,
	buildTitleGenerationPrompt,
	parseTitleGenerationResponse,
} from './titleGeneration';

/** The accumulated outcome of the cold-start side-query stream. */
interface TitleStreamOutcome {
	text: string;
	errored: boolean;
}

const TITLE_GEN_FAILED_MESSAGE = 'Title generation produced no usable title.';

/**
 * Generate a conversation title via a cold-start side-query (SPEC-TS-016,
 * ADR-TS-003, REQ-TS-024/025). Mirrors claudian-main
 * `QueryBackedTitleGenerationService` (one-shot aux query). Drives
 * `runtime.query(turn, [], { forceColdStart: true })` so the side-query ignores
 * any bound session and does NOT steer the tab's main stream; accumulates `text`
 * chunks (tool/thinking ignored); `done` terminates. `parseTitleGenerationResponse`
 * → `Result.ok(title)`; a `null` parse or an `error` chunk → `Result.err` (the
 * error-as-chunk mapped to a `Result` at this boundary, ADR-CC-001 §2). NEVER
 * surfaces `NotificationPort.showError` (REQ-TS-025) — the caller keeps the
 * fallback. `Result`-returning (ADR-004); no `providerId` branch (REQ-TS-026).
 */
export class GenerateTitleUseCase {
	constructor(private readonly runtime: ChatRuntimePort) {}

	async execute(firstUserMessage: string): Promise<Result<string>> {
		// The system prompt frames the one-shot request; the runtime applies it as
		// the side-query's system prompt. P3's ChatTurnRequest carries only `text`,
		// so the framed prompt is the turn text (no invented domain field).
		const prepared = this.runtime.prepareTurn({
			text: `${TITLE_GENERATION_SYSTEM_PROMPT}\n\n${buildTitleGenerationPrompt(firstUserMessage)}`,
		});

		const drained = await tryAsync(() => this.accumulate(prepared));
		if (!drained.ok) {
			// An unexpected generator throw becomes a Result, never crosses the boundary.
			return err(drained.error);
		}

		const { text, errored } = drained.value;
		if (errored) return err(new Error(TITLE_GEN_FAILED_MESSAGE));

		const title = parseTitleGenerationResponse(text);
		if (title === null) return err(new Error(TITLE_GEN_FAILED_MESSAGE));
		return ok(title);
	}

	/** Drain the cold-start side-query, accumulating `text`; stop on `done`. */
	private async accumulate(
		prepared: ReturnType<ChatRuntimePort['prepareTurn']>,
	): Promise<TitleStreamOutcome> {
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
			// tool/thinking/usage and any other member are ignored for title-gen.
		}
		return { text, errored };
	}
}
