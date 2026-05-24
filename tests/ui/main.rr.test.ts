/**
 * T-RR-042 (TEST-RR-026 dev leg) — the standalone entry (`src/ui/main.ts`,
 * MockBridge) streams the default scripted RICH turn (SPEC-RR-013, T-RR-010) and
 * every renderer reachable through the `MessageBlocks` dispatcher (SPEC-RR-022)
 * mounts: a thinking block, tool-call blocks, a Write/Edit word-diff, and the task
 * list. This is the DETERMINISTIC leg of the `npm run dev` rich smoke — it proves
 * the scripted chunks flow store → `MessageBlocks` → the block components
 * headlessly; the live-browser visual feel pairs with the human run recorded in
 * `test-plan.md`.
 *
 * Extends the P1 standalone mount (TEST-PSR-022 / TEST-CC-015). Queried by
 * `data-testid` only (ADR-009). Traces: NFR-RR-002, NFR-RR-014.
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Drive the live standalone surface through one full turn: type into the composer
 * textarea, send with Enter, then flush the per-chunk microtask yield boundaries
 * until the scripted rich turn (+ its `done`) is fully accumulated and rendered.
 *
 * The default script now emits a `Task` spawn before the subagent chunks
 * (CLAR-RR-008), so the store seeds the `SubagentInfo` and pushes a top-level
 * `{type:'subagent'}` block — the `MessageBlocks` dispatcher mounts a
 * `SubagentBlock`. `UsageInfo.vue` is mounted in the `ChatSurface` footer (Gap 1,
 * REQ-RR-024), so the usage chunk renders `usage-info`. Both are asserted below.
 */
async function sendAndDrainRichTurn(): Promise<void> {
	const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]');
	if (textarea === null) throw new Error('composer-textarea not found');
	textarea.value = 'go';
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	await Promise.resolve();
	textarea.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
	);
	// The MockChatRuntime yields each scripted chunk on its own resumed tick, so
	// drain generously past the ~17-chunk default rich script + the terminating
	// `done` to let the store accumulate every block before asserting.
	for (let i = 0; i < 60; i++) {
		await Promise.resolve();
	}
}

function has(tid: string): boolean {
	return document.querySelector(`[data-testid="${tid}"]`) !== null;
}

/**
 * Expand every collapsible block (collapsed by default — SPEC-RR-024) so the
 * body-level renderers (diff lines, task rows, subagent prompt/result) mount.
 */
async function expandAllCollapsibles(): Promise<void> {
	const headers = document.querySelectorAll<HTMLElement>('[data-testid="sp-collapsible-header"]');
	headers.forEach((h) => h.dispatchEvent(new MouseEvent('click', { bubbles: true })));
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

describe('standalone rich-render smoke (TEST-RR-026 dev leg)', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('streams the scripted rich turn and mounts every MessageBlocks renderer', async () => {
		await import('@/ui/main');
		// Flush the post-mount microtask (locale narrowing) before driving.
		await Promise.resolve();
		expect(has('chat-surface')).toBe(true);

		await sendAndDrainRichTurn();

		// The dispatcher iterated the ordered content blocks (REQ-RR-011); the
		// collapsed-by-default header-level renderers are present immediately.
		expect(has('message-blocks')).toBe(true);
		expect(has('thinking-block')).toBe(true); // SPEC-RR-027
		expect(has('tool-call-header')).toBe(true); // SPEC-RR-026
		expect(has('write-edit-header')).toBe(true); // SPEC-RR-029 (header)
		expect(has('subagent-block')).toBe(true); // SPEC-RR-030 (Task spawn → subagent block, CLAR-RR-008)
		expect(has('usage-info')).toBe(true); // SPEC-RR-031 (turn-level usage footer, REQ-RR-024)

		// Expand the collapsibles to reveal the body-level renderers.
		await expandAllCollapsibles();
		expect(has('diff-line')).toBe(true); // SPEC-RR-029 (word-diff body)
		expect(has('todo-list')).toBe(true); // SPEC-RR-028 (task list)

		// Icons resolve through the provided ICON_PORT — declarative SVG, no v-html.
		const icon = document.querySelector('[data-testid="sp-icon"]');
		expect(icon?.querySelector('svg')).not.toBeNull();
		// No DOM-injection sink: no <script> element was injected (NFR-RR-006).
		const app = document.querySelector('#app');
		expect(app?.querySelector('script')).toBeNull();
	});
});
