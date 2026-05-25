import { ref, shallowRef, type Ref } from 'vue';
import type { ComposerMode } from '@/domain/chat/composer/ComposerMode';
import type {
	CatalogEntry,
	MentionReferent,
	ProviderCommandCatalogPort,
	ChatRuntimePort,
} from '@/domain/ports';
import type {
	AskUserQuestionRequest,
	ExitPlanModeRequest,
	ApprovalRequest,
} from '@/domain/chat/inline';
import {
	detectTrigger,
	shouldEnterInstruction,
	shouldEnterBangBash,
	replaceTriggerToken,
} from '@/application/chat/composer/triggerParse';
import {
	listBuiltInCommands,
	type BuiltInAction,
} from '@/application/chat/composer/builtInCommands';
import type { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import type { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import type {
	SubmitBangBashUseCase,
	BangBashOutput,
} from '@/application/chat/composer/SubmitBangBashUseCase';
import type { RefineInstructionUseCase } from '@/application/chat/composer/RefineInstructionUseCase';
import type { SettingsPort } from '@/domain/ports';
import { appendInstruction } from '@/domain/settings/PluginSettings';
import type { InstructionConfirmFn } from '@/ui/chat/modalSeam';

/**
 * A pending inline-block request the composer renders in place of the textarea
 * (SPEC-CP-018/022..024). A plain DTO — the runtime/callback wiring lives in
 * `RespondToInlineBlockUseCase`, never in reactive state (NFR-CP-005).
 */
export type InlineBlockEntry =
	| { kind: 'ask_user_question'; request: AskUserQuestionRequest }
	| { kind: 'exit_plan_mode'; request: ExitPlanModeRequest }
	| { kind: 'approval_request'; request: ApprovalRequest };

/** A palette row: a slash/skill `CatalogEntry` OR a `@`-mention `MentionReferent`. */
export type PaletteEntry = CatalogEntry | MentionReferent;

/** The collaborators the arbiter drives — passed in (no `inject` here) so the composable unit-tests cleanly. */
export interface UseComposerModeOptions {
	readonly runCommand: RunCommandUseCase;
	readonly resolveMention: ResolveMentionUseCase;
	readonly submitBangBash: SubmitBangBashUseCase;
	readonly catalog: ProviderCommandCatalogPort;
	/** Read for `getCapabilities().supportsPlanMode` (SPEC-CP-032 — never a provider branch). */
	readonly runtime: ChatRuntimePort;
	/** Apply a text/caret rewrite to the composer (confirm insert). */
	readonly onInsert: (value: string, caret: number) => void;
	/** Dispatch a built-in action (`/clear` etc.) the host wires to the existing flow. */
	readonly onAction: (action: BuiltInAction) => void;
	/** Surface a completed bang-bash run as a render-only output block. */
	readonly onBangBashOutput: (output: BangBashOutput) => void;
	/** Live read of the composer value/caret (the source of truth stays in `ChatComposer`). */
	readonly getValue: () => string;
	readonly getCaret: () => number;
	/** Mention-filter debounce window (REQ-CP-014). */
	readonly debounceMs?: number;
	// ── Instruction ladder (SPEC-CP-027) — optional collaborators. ──────────────
	/**
	 * Best-effort instruction refine (SPEC-CP-015). When provided, the ladder
	 * attempts a refine before the confirm; a refine failure falls through with the
	 * RAW instruction (EC-CP-9). When absent, the raw instruction is confirmed.
	 */
	readonly refineInstruction?: RefineInstructionUseCase;
	/** Persists the appended `customSystemPrompt` on accept (REQ-CP-018). */
	readonly settings?: SettingsPort;
	/** Opens the instruction-confirm modal via the seam (SPEC-CP-027). */
	readonly confirmInstruction?: InstructionConfirmFn;
	/**
	 * P5 (SPEC-CA-022, REQ-CA-001): fired with a FILE mention's vault path when a
	 * `file`-kind referent is confirmed, so the parent ADDS a context chip. ADDITIVE
	 * — the P4 `mentionText` insertion (REQ-CP-013) is unchanged; this fires
	 * ALONGSIDE it. Absent → no chip behaviour (pure P4). Non-file referents
	 * (folder/subagent/mcp/external-dir) never fire it.
	 */
	readonly onFileMention?: (path: string) => void;
}

/** The composable's public surface (SPEC-CP-018). */
export interface ComposerModeApi {
	readonly mode: Ref<ComposerMode>;
	readonly paletteEntries: Ref<PaletteEntry[]>;
	readonly activeInlineBlock: Ref<InlineBlockEntry | null>;
	handleInput(value: string, caret: number): void;
	handleKeydown(event: KeyboardEvent): boolean;
	confirmEntry(index: number): Promise<void>;
	enqueueInlineBlock(entry: InlineBlockEntry, hooks?: { warn?: (msg: string) => void }): boolean;
	resolveInlineBlock(): void;
	/**
	 * Run the instruction ladder for a submitted raw instruction (SPEC-CP-027): an
	 * empty/whitespace instruction exits without persisting (REQ-CP-019); otherwise
	 * optionally refine (refine-fail → raw, EC-CP-9), confirm, and on accept append
	 * to `customSystemPrompt` (prior preserved, REQ-CP-018). Returns to `default`.
	 */
	submitInstruction(rawInstruction: string): Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 120;

/** True when the active mode owns a palette (slash/skills/mention). */
function isPaletteMode(kind: ComposerMode['kind']): boolean {
	return kind === 'slash' || kind === 'skills' || kind === 'mention';
}

/**
 * `useComposerMode` — the composer-mode arbiter (SPEC-CP-018, SPEC-CP-031,
 * ADR-CP-001 §1/§4). Owns a `ref<ComposerMode>` (DTO, no Pinia store — NFR-CP-005)
 * and is the SOLE arbiter of the active trigger surface (REQ-CP-034). The pure
 * trigger-parse (SPEC-CP-012) classifies on every input; the P1 send contract is
 * preserved by gating it behind `kind==='default'` && `handleKeydown→false`
 * (REQ-CP-035). The use-case instances / runtime / catalog live OUTSIDE the refs
 * (only plain DTOs cross the reactive boundary). No `obsidian`/`node:*` import.
 *
 * - **Request-id guard (REQ-CP-004, EC-CP-3):** each palette open / filter change
 *   stamps a monotonic id; a late `getEntries` response whose id is stale is
 *   discarded (no flicker of stale entries).
 * - **Debounced mention filtering (REQ-CP-014):** rapid keystrokes query the
 *   provider once after the window; an `AbortSignal` cancels the prior in-flight.
 * - **Bang-bash explicit-Enter only (S1, REQ-CP-032, EC-CP-5):** the shell runs
 *   ONLY from the explicit-Enter branch of `handleKeydown`, never from input.
 * - **Depth-counted inline-block queue (EC-CP-12):** the composer reappears only
 *   when the LAST block resolves.
 */
export function useComposerMode(options: UseComposerModeOptions): ComposerModeApi {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

	const mode = ref<ComposerMode>({ kind: 'default', planActive: false });
	const paletteEntries = ref<PaletteEntry[]>([]) as Ref<PaletteEntry[]>;
	const activeInlineBlock = shallowRef<InlineBlockEntry | null>(null);

	// Non-reactive arbiter state — the trigger token span for the open palette,
	// the monotonic request id, and the inline-block depth/debounce handles.
	let tokenStart = 0;
	let requestId = 0;
	let debounceHandle: ReturnType<typeof setTimeout> | null = null;
	let inflightAbort: AbortController | null = null;
	const inlineQueue: InlineBlockEntry[] = [];

	function setMode(kind: ComposerMode['kind']): void {
		mode.value = { kind, planActive: mode.value.planActive };
	}

	function closePalette(): void {
		paletteEntries.value = [];
		if (debounceHandle !== null) {
			clearTimeout(debounceHandle);
			debounceHandle = null;
		}
		if (inflightAbort !== null) {
			inflightAbort.abort();
			inflightAbort = null;
		}
		// Invalidate any in-flight response (req-guard).
		requestId += 1;
	}

	/** Load the slash/skills palette: built-ins first, then the request-guarded provider entries. */
	function loadCommandPalette(filter: string, kind: 'slash' | 'skills'): void {
		const myId = (requestId += 1);
		const prefix = kind === 'slash' ? '/' : '$';
		const needle = filter.trim().toLowerCase();
		const builtIns =
			kind === 'slash'
				? listBuiltInCommands().filter(
						(c) => needle === '' || c.name.toLowerCase().includes(needle),
				  )
				: [];
		paletteEntries.value = builtIns;
		void options.catalog
			.getEntries(kind === 'slash' ? 'command' : 'skill')
			.then((entries) => {
				if (myId !== requestId) return; // stale response — discard (EC-CP-3).
				const matched = entries.filter(
					(e) => e.prefix === prefix && (needle === '' || e.name.toLowerCase().includes(needle)),
				);
				paletteEntries.value = [...builtIns, ...matched];
			});
	}

	/** Load the `@`-mention palette: debounced query with an abortable signal (REQ-CP-014). */
	function loadMentionPalette(filter: string): void {
		const myId = (requestId += 1);
		if (debounceHandle !== null) clearTimeout(debounceHandle);
		debounceHandle = setTimeout(() => {
			debounceHandle = null;
			if (inflightAbort !== null) inflightAbort.abort();
			const controller = new AbortController();
			inflightAbort = controller;
			void options.resolveMention.query(filter, controller.signal).then((result) => {
				if (myId !== requestId) return; // stale — discard.
				paletteEntries.value = result.ok ? result.value : [];
			});
		}, debounceMs);
	}

	function handleInput(value: string, caret: number): void {
		const hit = detectTrigger(value, caret);
		if (hit !== null) {
			tokenStart = hit.tokenStart;
			setMode(hit.kind);
			if (hit.kind === 'mention') loadMentionPalette(hit.filter);
			else loadCommandPalette(hit.filter, hit.kind);
			return;
		}
		// No slash/skills/mention trigger. The instruction/bang-bash modes engage
		// when `#`/`!` leads the input — i.e. the value before the trigger char is
		// empty/whitespace (the pure gate, REQ-CP-015/029) — then persist as the body
		// is typed after it (SPEC-CP-012).
		closePalette();
		const trimmed = value.trimStart();
		const beforeTrigger = value.slice(0, value.length - trimmed.length);
		if (trimmed.startsWith('#') && shouldEnterInstruction(beforeTrigger)) {
			setMode('instruction');
			return;
		}
		if (trimmed.startsWith('!') && shouldEnterBangBash(beforeTrigger)) {
			setMode('bang-bash');
			return;
		}
		setMode('default');
	}

	function togglePlan(event: KeyboardEvent): boolean {
		if (!options.runtime.getCapabilities().supportsPlanMode) return false; // inert (EC-CP-7).
		event.preventDefault();
		mode.value = { kind: mode.value.kind, planActive: !mode.value.planActive };
		return true;
	}

	async function runBangBash(): Promise<void> {
		const raw = options.getValue();
		const command = raw.startsWith('!') ? raw.slice(1) : raw;
		if (command.trim() === '') return;
		const result = await options.submitBangBash.execute(command);
		if (result.ok) options.onBangBashOutput(result.value);
	}

	/** Escape closes the active palette/mode, leaving text intact (EC-CP-3/4). */
	function handleEscape(event: KeyboardEvent): boolean {
		const kind = mode.value.kind;
		if (isPaletteMode(kind)) closePalette();
		else if (kind !== 'instruction' && kind !== 'bang-bash') return false;
		setMode('default');
		event.preventDefault();
		return true;
	}

	/** While a palette is open, confirm/navigate keys are consumed (the dropdown owns the highlight). */
	function handlePaletteKey(event: KeyboardEvent): boolean {
		if (event.key === 'Enter' || event.key === 'Tab') {
			if (!event.isComposing) event.preventDefault();
			return true;
		}
		return event.key === 'ArrowUp' || event.key === 'ArrowDown';
	}

	function handleKeydown(event: KeyboardEvent): boolean {
		// Shift+Tab toggles the orthogonal plan flag iff capable; consumes the event.
		if (event.key === 'Tab' && event.shiftKey) return togglePlan(event);
		if (event.key === 'Escape') return handleEscape(event);
		// Bang-bash: an explicit Enter (no shift, no IME) runs the command (S1/EC-CP-5).
		if (mode.value.kind === 'bang-bash' && event.key === 'Enter') {
			if (event.shiftKey || event.isComposing) return false;
			event.preventDefault();
			void runBangBash();
			return true;
		}
		if (isPaletteMode(mode.value.kind)) return handlePaletteKey(event);
		// inline-block mode never sends; the block owns its own keys.
		return mode.value.kind === 'inline-block';
	}

	async function confirmEntry(index: number): Promise<void> {
		if (index < 0 || index >= paletteEntries.value.length) return;
		const entry = paletteEntries.value[index];
		const caret = options.getCaret();
		const value = options.getValue();
		if ('mentionText' in entry) {
			// REQ-CP-013: the insertion is the referent's `mentionText` verbatim.
			const next = replaceTriggerToken(value, tokenStart, caret, entry.mentionText);
			closePalette();
			setMode('default');
			options.onInsert(next.value, next.caret);
			// P5 (SPEC-CA-022, REQ-CA-001): a FILE referent ALSO adds a context chip via
			// its vault path (`detail`); the insertion above is unchanged (additive).
			if (entry.kind === 'file' && entry.detail !== undefined && entry.detail !== '') {
				options.onFileMention?.(entry.detail);
			}
			return;
		}
		const outcome = await options.runCommand.execute(entry);
		closePalette();
		setMode('default');
		if (!outcome.ok) return;
		if (outcome.value.kind === 'action') {
			options.onAction(outcome.value.action);
			return;
		}
		const next = replaceTriggerToken(value, tokenStart, caret, outcome.value.text);
		options.onInsert(next.value, next.caret);
	}

	function enqueueInlineBlock(
		entry: InlineBlockEntry,
		hooks?: { warn?: (msg: string) => void },
	): boolean {
		// EC-CP-12: an empty/malformed request is ignored + warned, not enqueued.
		if (entry.kind === 'ask_user_question' && entry.request.questions.length === 0) {
			hooks?.warn?.('ignored ask_user_question with no questions');
			return false;
		}
		inlineQueue.push(entry);
		activeInlineBlock.value = inlineQueue[0];
		setMode('inline-block');
		return true;
	}

	function resolveInlineBlock(): void {
		inlineQueue.shift();
		if (inlineQueue.length > 0) {
			activeInlineBlock.value = inlineQueue[0];
			return;
		}
		// The last block resolved — restore the composer (EC-CP-12).
		activeInlineBlock.value = null;
		setMode('default');
	}

	/**
	 * The instruction ladder (SPEC-CP-027, REQ-CP-015..019). Empty/whitespace →
	 * exit, persist nothing (REQ-CP-019). Otherwise: optionally refine (best-effort,
	 * refine-fail → the RAW instruction, EC-CP-9) → confirm via the seam → on accept
	 * append the (possibly edited) instruction to `customSystemPrompt` (prior
	 * preserved, REQ-CP-018) → on reject/dismiss persist nothing (REQ-CP-017).
	 * Always returns to `default`.
	 */
	async function submitInstruction(rawInstruction: string): Promise<void> {
		const trimmed = rawInstruction.trim();
		if (trimmed === '' || options.confirmInstruction === undefined || options.settings === undefined) {
			setMode('default');
			return;
		}

		const existing = (await options.settings.getSettings()).customSystemPrompt;

		// Best-effort refine: on err / a clarification, fall through to the raw text.
		let candidate = trimmed;
		if (options.refineInstruction !== undefined) {
			const refined = await options.refineInstruction.execute(trimmed, existing);
			if (refined.ok && refined.value.kind === 'refined') candidate = refined.value.instruction;
		}

		const decision = await options.confirmInstruction(candidate);
		setMode('default');
		if (decision === null || decision.kind === 'reject') return; // persist nothing.

		const current = await options.settings.getSettings();
		await options.settings.saveSettings({
			...current,
			customSystemPrompt: appendInstruction(current.customSystemPrompt, decision.instruction),
		});
	}

	return {
		mode,
		paletteEntries,
		activeInlineBlock,
		handleInput,
		handleKeydown,
		confirmEntry,
		enqueueInlineBlock,
		resolveInlineBlock,
		submitInstruction,
	};
}
