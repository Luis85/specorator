/**
 * T-CP-027 (RED) — `useComposerMode` composable (TEST-CP-022 + the U leg of
 * TEST-CP-012 req-guard + TEST-CP-015 debounce).
 *
 * SPEC-CP-018, SPEC-CP-031, ADR-CP-001. The mode arbiter over the pure
 * trigger-parse: one active mode (REQ-CP-034); `handleKeydown` returns `true`
 * when it consumed the event so the P1 send fires only when `kind==='default'`
 * && it returned `false` (REQ-CP-035); `Shift+Tab` toggles `planActive` iff
 * `supportsPlanMode` and consumes the event (REQ-CP-020/021, EC-CP-7); `Escape`
 * closes the active palette/mode leaving text intact and returns `true`
 * (EC-CP-3/4); `paletteEntries` = built-ins ++ the request-guarded `getEntries`
 * (stale response discarded, EC-CP-3) or the debounced `ResolveMentionUseCase`
 * query (five fast keystrokes → one query, an `AbortSignal` cancels the prior,
 * REQ-CP-014); `confirmEntry` → action/insert via `replaceTriggerToken`; the
 * depth-counted inline-block queue (composer restores only when the last
 * resolves, EC-CP-12); `SubmitBangBashUseCase.execute` only on explicit Enter
 * (S1, REQ-CP-032, EC-CP-5). DTO-only reactive state (NFR-CP-005).
 *
 * Traces: REQ-CP-004/014/027/032/034/035/036, NFR-CP-001/005.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useComposerMode } from '@/ui/chat/composer/useComposerMode';
import { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import { SubmitBangBashUseCase } from '@/application/chat/composer/SubmitBangBashUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockMentionDataProvider, MockShellExec } from '@/infrastructure/mock/MockComposerPorts';
import type {
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
	MentionReferent,
} from '@/domain/ports';
import type { AskUserQuestionRequest } from '@/domain/chat/inline';

/** A scriptable catalog so a test can fire a stale + a fresh response (req-guard). */
class ScriptableCatalog implements ProviderCommandCatalogPort {
	private queue: Array<{ delay: number; entries: CatalogEntry[] }> = [];
	calls = 0;

	push(entries: CatalogEntry[], delay: number): void {
		this.queue.push({ delay, entries });
	}

	getEntries(_kind: CatalogEntryKind): Promise<CatalogEntry[]> {
		this.calls += 1;
		const next = this.queue.shift() ?? { delay: 0, entries: [] };
		if (next.delay <= 0) return Promise.resolve(next.entries);
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve(next.entries);
			}, next.delay);
		});
	}
}

function makeArbiter(
	overrides: {
		catalog?: ProviderCommandCatalogPort;
		mentions?: MockMentionDataProvider;
		shell?: MockShellExec;
		runtime?: MockChatRuntime;
		onInsert?: (value: string, caret: number) => void;
		onAction?: (action: string) => void;
		onBangBashOutput?: (output: unknown) => void;
		getValue?: () => string;
		getCaret?: () => number;
		debounceMs?: number;
	} = {},
) {
	const runtime = overrides.runtime ?? new MockChatRuntime();
	const catalog = overrides.catalog ?? new ScriptableCatalog();
	const mentions = overrides.mentions ?? new MockMentionDataProvider();
	const shell = overrides.shell ?? new MockShellExec();
	const onInsert = overrides.onInsert ?? vi.fn();
	const onAction = overrides.onAction ?? vi.fn();
	const onBangBashOutput = overrides.onBangBashOutput ?? vi.fn();
	let value = '';
	let caret = 0;
	const arbiter = useComposerMode({
		runCommand: new RunCommandUseCase(),
		resolveMention: new ResolveMentionUseCase(mentions),
		submitBangBash: new SubmitBangBashUseCase(shell),
		catalog,
		runtime,
		onInsert: (v, c) => {
			value = v;
			caret = c;
			onInsert(v, c);
		},
		onAction,
		onBangBashOutput,
		getValue: overrides.getValue ?? (() => value),
		getCaret: overrides.getCaret ?? (() => caret),
		debounceMs: overrides.debounceMs ?? 120,
	});
	return { arbiter, runtime, catalog, mentions, shell, onInsert, onAction, onBangBashOutput };
}

function keydown(init: KeyboardInit): KeyboardEvent {
	return new KeyboardEvent('keydown', { cancelable: true, ...init });
}
interface KeyboardInit {
	key: string;
	shiftKey?: boolean;
	isComposing?: boolean;
}

describe('useComposerMode (TEST-CP-022)', () => {
	it('starts in default mode with planActive false', () => {
		const { arbiter } = makeArbiter();
		expect(arbiter.mode.value.kind).toBe('default');
		expect(arbiter.mode.value.planActive).toBe(false);
	});

	it('REQ-CP-034: one active mode — a slash trigger opens the slash palette', () => {
		const { arbiter } = makeArbiter();
		arbiter.handleInput('/cl', 3);
		expect(arbiter.mode.value.kind).toBe('slash');
	});

	it('REQ-CP-034: a `$` trigger opens skills, a `@` opens mention, distinct from slash', () => {
		const { arbiter } = makeArbiter();
		arbiter.handleInput('$su', 3);
		expect(arbiter.mode.value.kind).toBe('skills');
		arbiter.handleInput('@no', 3);
		expect(arbiter.mode.value.kind).toBe('mention');
	});

	it('REQ-CP-015/029: `#`/`!` on empty input enter instruction / bang-bash', () => {
		const { arbiter } = makeArbiter();
		arbiter.handleInput('#', 1);
		expect(arbiter.mode.value.kind).toBe('instruction');
		arbiter.handleInput('!', 1);
		expect(arbiter.mode.value.kind).toBe('bang-bash');
	});

	it('falls back to default when no trigger applies on non-empty input', () => {
		const { arbiter } = makeArbiter();
		arbiter.handleInput('/cl', 3);
		expect(arbiter.mode.value.kind).toBe('slash');
		arbiter.handleInput('hello world', 11);
		expect(arbiter.mode.value.kind).toBe('default');
	});

	it('REQ-CP-035: handleKeydown returns false in default so the P1 send fires', () => {
		const { arbiter } = makeArbiter();
		const handled = arbiter.handleKeydown(keydown({ key: 'Enter' }));
		expect(handled).toBe(false);
	});

	it('REQ-CP-035: Enter while a palette is open is handled (true) so send is suppressed', async () => {
		const catalog = new ScriptableCatalog();
		catalog.push([], 0);
		const { arbiter } = makeArbiter({ catalog });
		arbiter.handleInput('/cl', 3);
		await Promise.resolve();
		const handled = arbiter.handleKeydown(keydown({ key: 'Enter' }));
		expect(handled).toBe(true);
	});

	it('EC-CP-7: Shift+Tab toggles planActive on a capable runtime and consumes the event', () => {
		const runtime = new MockChatRuntime();
		runtime.setSupportsPlanMode(true);
		const { arbiter } = makeArbiter({ runtime });
		const event = keydown({ key: 'Tab', shiftKey: true });
		const handled = arbiter.handleKeydown(event);
		expect(handled).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(arbiter.mode.value.planActive).toBe(true);
		// toggles back off
		arbiter.handleKeydown(keydown({ key: 'Tab', shiftKey: true }));
		expect(arbiter.mode.value.planActive).toBe(false);
	});

	it('EC-CP-7: Shift+Tab is inert when supportsPlanMode is false (no toggle, not consumed)', () => {
		const runtime = new MockChatRuntime();
		runtime.setSupportsPlanMode(false);
		const { arbiter } = makeArbiter({ runtime });
		const event = keydown({ key: 'Tab', shiftKey: true });
		const handled = arbiter.handleKeydown(event);
		expect(handled).toBe(false);
		expect(arbiter.mode.value.planActive).toBe(false);
	});

	it('EC-CP-3/4: Escape closes the active palette leaving text intact and returns true', async () => {
		const catalog = new ScriptableCatalog();
		catalog.push([], 0);
		const onInsert = vi.fn();
		const { arbiter } = makeArbiter({ catalog, onInsert });
		arbiter.handleInput('look at @no', 11);
		expect(arbiter.mode.value.kind).toBe('mention');
		const handled = arbiter.handleKeydown(keydown({ key: 'Escape' }));
		expect(handled).toBe(true);
		expect(arbiter.mode.value.kind).toBe('default');
		// text is NOT rewritten on cancel (no destructive replace) — onInsert never fired.
		expect(onInsert).not.toHaveBeenCalled();
	});

	it('REQ-CP-003: slash palette lists the six built-ins before provider entries', async () => {
		const catalog = new ScriptableCatalog();
		catalog.push(
			[{ kind: 'command', prefix: '/', name: 'deploy', description: 'd', builtIn: false }],
			0,
		);
		const { arbiter } = makeArbiter({ catalog });
		arbiter.handleInput('/', 1);
		await Promise.resolve();
		await Promise.resolve();
		const names = arbiter.paletteEntries.value.map((e) => e.name);
		expect(names.slice(0, 6)).toEqual(['clear', 'new', 'add-dir', 'resume', 'fork', 'compact']);
		expect(names).toContain('deploy');
		expect(names.indexOf('deploy')).toBeGreaterThan(names.indexOf('compact'));
	});

	it('EC-CP-3 (req-guard): a stale getEntries response is discarded; only the fresh one renders', async () => {
		vi.useFakeTimers();
		const catalog = new ScriptableCatalog();
		// First open: slow response (stale). Second open: fast response (fresh).
		catalog.push([{ kind: 'command', prefix: '/', name: 'stale', builtIn: false }], 100);
		catalog.push([{ kind: 'command', prefix: '/', name: 'fresh', builtIn: false }], 10);
		const { arbiter } = makeArbiter({ catalog });
		arbiter.handleInput('/', 1); // request id 1 (slow)
		arbiter.handleInput('/f', 2); // request id 2 (fast) — supersedes
		await vi.advanceTimersByTimeAsync(150);
		const names = arbiter.paletteEntries.value.map((e) => e.name);
		expect(names).toContain('fresh');
		expect(names).not.toContain('stale');
		vi.useRealTimers();
	});

	it('REQ-CP-014 (debounce): five fast mention keystrokes query the provider once', async () => {
		vi.useFakeTimers();
		const mentions = new MockMentionDataProvider();
		const spy = vi.spyOn(mentions, 'query');
		const { arbiter } = makeArbiter({ mentions, debounceMs: 120 });
		arbiter.handleInput('@a', 2);
		arbiter.handleInput('@ab', 3);
		arbiter.handleInput('@abc', 4);
		arbiter.handleInput('@abcd', 5);
		arbiter.handleInput('@abcde', 6);
		await vi.advanceTimersByTimeAsync(200);
		expect(spy).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it('REQ-CP-014 (debounce): the prior in-flight mention query is aborted', async () => {
		vi.useFakeTimers();
		const mentions = new MockMentionDataProvider();
		const signals: Array<AbortSignal | undefined> = [];
		vi.spyOn(mentions, 'query').mockImplementation((_f, signal) => {
			signals.push(signal);
			return Promise.resolve([] as MentionReferent[]);
		});
		const { arbiter } = makeArbiter({ mentions, debounceMs: 50 });
		arbiter.handleInput('@a', 2);
		await vi.advanceTimersByTimeAsync(60);
		arbiter.handleInput('@ab', 3);
		await vi.advanceTimersByTimeAsync(60);
		expect(signals[0]?.aborted).toBe(true);
		vi.useRealTimers();
	});

	it('REQ-CP-006: confirming an action built-in dispatches the action (not an insert)', async () => {
		const catalog = new ScriptableCatalog();
		catalog.push([], 0);
		const onAction = vi.fn();
		const onInsert = vi.fn();
		const { arbiter } = makeArbiter({ catalog, onAction, onInsert });
		arbiter.handleInput('/cl', 3);
		await Promise.resolve();
		await Promise.resolve();
		// `clear` is the first built-in.
		await arbiter.confirmEntry(0);
		expect(onAction).toHaveBeenCalledWith('clear');
		expect(onInsert).not.toHaveBeenCalled();
	});

	it('REQ-CP-013: confirming a mention inserts the referent mentionText via replaceTriggerToken', async () => {
		const mentions = new MockMentionDataProvider();
		const onInsert = vi.fn();
		const { arbiter } = makeArbiter({ mentions, onInsert, getValue: () => 'look at @no', getCaret: () => 11 });
		vi.useFakeTimers();
		arbiter.handleInput('look at @no', 11);
		await vi.advanceTimersByTimeAsync(200);
		vi.useRealTimers();
		// `notes.md` referent: mentionText '@notes.md'
		const idx = arbiter.paletteEntries.value.findIndex(
			(e) => 'mentionText' in e && e.mentionText === '@notes.md',
		);
		expect(idx).toBeGreaterThanOrEqual(0);
		await arbiter.confirmEntry(idx);
		// token [8,11] (`@no`) replaced; the `look at ` prefix preserved.
		expect(onInsert).toHaveBeenCalledWith('look at @notes.md', expect.any(Number));
	});

	// ── FIX-2.1 (was R-CA-002): a file mention also adds a context chip ──────────
	// SPEC-CA-022, REQ-CA-001. ADDITIVE — the P4 mentionText insertion is unchanged
	// (REQ-CP-013, asserted above); resolving a `file` referent ALSO fires
	// `onFileMention` with the file's vault path so the parent adds a chip.

	it('REQ-CA-001: confirming a FILE mention fires onFileMention with the file path (chip), keeps the insertion', async () => {
		const onFileMention = vi.fn();
		const onInsert = vi.fn();
		const arbiter = useComposerMode({
			runCommand: new RunCommandUseCase(),
			resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
			submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
			catalog: new ScriptableCatalog(),
			runtime: new MockChatRuntime(),
			onInsert: (v, c) => onInsert(v, c),
			onAction: vi.fn(),
			onBangBashOutput: vi.fn(),
			getValue: () => 'look at @no',
			getCaret: () => 11,
			debounceMs: 120,
			onFileMention,
		});
		vi.useFakeTimers();
		arbiter.handleInput('look at @no', 11);
		await vi.advanceTimersByTimeAsync(200);
		vi.useRealTimers();
		// `notes.md` is a FILE referent (detail = 'notes.md', the vault path).
		const idx = arbiter.paletteEntries.value.findIndex(
			(e) => 'mentionText' in e && e.mentionText === '@notes.md',
		);
		expect(idx).toBeGreaterThanOrEqual(0);
		await arbiter.confirmEntry(idx);
		// The chip path is the referent's vault path (its `detail`).
		expect(onFileMention).toHaveBeenCalledWith('notes.md');
		// The P4 insertion is NOT regressed — the token is still inserted.
		expect(onInsert).toHaveBeenCalledWith('look at @notes.md', expect.any(Number));
	});

	it('REQ-CA-001: confirming a NON-file mention (subagent) does NOT fire onFileMention', async () => {
		const onFileMention = vi.fn();
		const arbiter = useComposerMode({
			runCommand: new RunCommandUseCase(),
			resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
			submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
			catalog: new ScriptableCatalog(),
			runtime: new MockChatRuntime(),
			onInsert: vi.fn(),
			onAction: vi.fn(),
			onBangBashOutput: vi.fn(),
			getValue: () => 'ask @rev',
			getCaret: () => 8,
			debounceMs: 120,
			onFileMention,
		});
		vi.useFakeTimers();
		arbiter.handleInput('ask @rev', 8);
		await vi.advanceTimersByTimeAsync(200);
		vi.useRealTimers();
		const idx = arbiter.paletteEntries.value.findIndex(
			(e) => 'mentionText' in e && e.mentionText === '@reviewer',
		);
		expect(idx).toBeGreaterThanOrEqual(0);
		await arbiter.confirmEntry(idx);
		expect(onFileMention).not.toHaveBeenCalled();
	});

	it('EC-CP-12: depth-counted inline-block queue — composer restores only after the last resolves', () => {
		const { arbiter } = makeArbiter();
		const q = [{ id: 'q1', question: 'Pick', options: [{ id: 'a', label: 'A' }] }];
		const req1: AskUserQuestionRequest = { requestId: 'r1', questions: q };
		const req2: AskUserQuestionRequest = { requestId: 'r2', questions: q };
		arbiter.enqueueInlineBlock({ kind: 'ask_user_question', request: req1 });
		expect(arbiter.mode.value.kind).toBe('inline-block');
		arbiter.enqueueInlineBlock({ kind: 'ask_user_question', request: req2 });
		expect(arbiter.mode.value.kind).toBe('inline-block');
		arbiter.resolveInlineBlock();
		expect(arbiter.mode.value.kind).toBe('inline-block'); // one still pending
		arbiter.resolveInlineBlock();
		expect(arbiter.mode.value.kind).toBe('default'); // last resolved → composer restored
	});

	it('EC-CP-12: an empty-questions ask-user chunk is ignored (not enqueued)', () => {
		const warn = vi.fn();
		const { arbiter } = makeArbiter();
		const empty: AskUserQuestionRequest = { requestId: 'r0', questions: [] };
		const enqueued = arbiter.enqueueInlineBlock(
			{ kind: 'ask_user_question', request: empty },
			{ warn },
		);
		expect(enqueued).toBe(false);
		expect(arbiter.mode.value.kind).toBe('default');
		expect(warn).toHaveBeenCalled();
	});

	it('the active inline block is exposed as a DTO for the component to render', () => {
		const { arbiter } = makeArbiter();
		const req: AskUserQuestionRequest = {
			requestId: 'r1',
			questions: [{ id: 'q1', question: 'Pick', options: [{ id: 'a', label: 'A' }] }],
		};
		arbiter.enqueueInlineBlock({ kind: 'ask_user_question', request: req });
		expect(arbiter.activeInlineBlock.value?.kind).toBe('ask_user_question');
	});
});

describe('useComposerMode bang-bash (TEST-CP-022, S1/REQ-CP-032, EC-CP-5)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('S1/REQ-CP-032: handleInput entering bang-bash never runs the shell', () => {
		const shell = new MockShellExec();
		const runSpy = vi.spyOn(shell, 'run');
		const { arbiter } = makeArbiter({ shell });
		arbiter.handleInput('!ls', 3);
		expect(arbiter.mode.value.kind).toBe('bang-bash');
		expect(runSpy).not.toHaveBeenCalled();
	});

	it('S1/REQ-CP-032: bang-bash runs the command verbatim ONLY on an explicit Enter', async () => {
		const shell = new MockShellExec();
		const runSpy = vi.spyOn(shell, 'run');
		const onBangBashOutput = vi.fn();
		const value = '!echo hi';
		const { arbiter } = makeArbiter({
			shell,
			onBangBashOutput,
			getValue: () => value,
			getCaret: () => value.length,
		});
		arbiter.handleInput('!echo hi', 8);
		expect(arbiter.mode.value.kind).toBe('bang-bash');
		const event = keydown({ key: 'Enter' });
		const handled = arbiter.handleKeydown(event);
		expect(handled).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		await Promise.resolve();
		await Promise.resolve();
		// the leading `!` is stripped — the shell runs `echo hi` verbatim.
		expect(runSpy).toHaveBeenCalledWith({ command: 'echo hi' });
		expect(onBangBashOutput).toHaveBeenCalledTimes(1);
	});

	it('S1/REQ-CP-032: Shift+Enter in bang-bash does NOT run (allows newline)', () => {
		const shell = new MockShellExec();
		const runSpy = vi.spyOn(shell, 'run');
		const { arbiter } = makeArbiter({ shell, getValue: () => '!ls', getCaret: () => 3 });
		arbiter.handleInput('!ls', 3);
		arbiter.handleKeydown(keydown({ key: 'Enter', shiftKey: true }));
		expect(runSpy).not.toHaveBeenCalled();
	});
});
