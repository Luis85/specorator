import { ok, err, type Result } from '@/domain/shared/Result';
import type { AuxModelPort } from '@/domain/ports';
import type { ToolDiffData } from '@/domain/chat/diff/Diff';
import { computeWordDiff } from './computeWordDiff';
import { parseInlineEditResponse } from './parseInlineEditResponse';
import { INLINE_EDIT_SYSTEM_PROMPT, buildInlineEditPrompt } from './inlineEditPrompt';

/** The decided inline-edit outcome the modal previews + applies (SPEC-CA-017). */
export type InlineEditOutcome =
	| { kind: 'replacement'; text: string; diff: ToolDiffData } // computeWordDiff(selectedText, text)
	| { kind: 'insertion'; text: string }
	| { kind: 'clarification'; question: string };

const INLINE_EDIT_FAILED_MESSAGE = 'Inline edit produced no usable result.';
const EMPTY_INSTRUCTION_MESSAGE = 'Inline edit requires a non-empty instruction.';

/** One prior clarification turn (SPEC-CA-017 `continue`). */
export interface InlineEditExchangeTurn {
	readonly role: 'user' | 'assistant';
	readonly text: string;
}

/**
 * Drive the inline-edit aux query → parse → outcome over `AuxModelPort` (no
 * provider-id branch, SPEC-CA-017/029, REQ-CA-021/022/026/027/028). Claudian
 * ground-truth: `QueryBackedInlineEditService`. `Result`-returning, never throws
 * across the boundary (NFR-CA-010 — `aux.run` maps error/empty/abort to
 * `Result.err`; the parse + `computeWordDiff` are pure/total). No `obsidian`/Vue.
 */
export class InlineEditUseCase {
	constructor(private readonly aux: AuxModelPort) {}

	/**
	 * Run one inline-edit query for the selection + instruction; abortable via
	 * `signal`. An empty/whitespace instruction → `err` defensively (no aux query).
	 */
	async execute(
		selectedText: string,
		instruction: string,
		notePath?: string,
		signal?: AbortSignal,
	): Promise<Result<InlineEditOutcome>> {
		if (instruction.trim() === '') return err(new Error(EMPTY_INSTRUCTION_MESSAGE));
		const prompt = buildInlineEditPrompt(selectedText, instruction, notePath);
		return this.run(selectedText, prompt, signal);
	}

	/**
	 * Continue an inline-edit clarification with a follow-up reply (REQ-CA-026):
	 * re-frame the prior exchange + the reply into a single instruction and re-run.
	 */
	async continue(
		selectedText: string,
		priorExchange: readonly InlineEditExchangeTurn[],
		reply: string,
		signal?: AbortSignal,
	): Promise<Result<InlineEditOutcome>> {
		if (reply.trim() === '') return err(new Error(EMPTY_INSTRUCTION_MESSAGE));
		const instruction = [...priorExchange.map(framePriorTurn), `User: ${reply}`].join('\n');
		const prompt = buildInlineEditPrompt(selectedText, instruction);
		return this.run(selectedText, prompt, signal);
	}

	/** Shared aux query → parse → outcome mapping for `execute` + `continue`. */
	private async run(
		selectedText: string,
		prompt: string,
		signal?: AbortSignal,
	): Promise<Result<InlineEditOutcome>> {
		const queried = await this.aux.run(prompt, { systemPrompt: INLINE_EDIT_SYSTEM_PROMPT, signal });
		if (!queried.ok) return err(new Error(INLINE_EDIT_FAILED_MESSAGE));

		const parsed = parseInlineEditResponse(queried.value);
		switch (parsed.kind) {
			case 'replacement':
				return ok({
					kind: 'replacement',
					text: parsed.text,
					diff: computeWordDiff(selectedText, parsed.text),
				});
			case 'insertion':
				return ok({ kind: 'insertion', text: parsed.text });
			case 'clarification':
				return ok({ kind: 'clarification', question: parsed.question });
			case 'failure':
				return err(new Error(INLINE_EDIT_FAILED_MESSAGE));
		}
	}
}

/** Frame one prior clarification turn for the re-run instruction. */
function framePriorTurn(turn: InlineEditExchangeTurn): string {
	return `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`;
}
