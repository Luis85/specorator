/**
 * Unit tests for the `specorator://` URI handler closure registered in
 * `src/plugin/main.ts:registerObsidianProtocolHandler`. The closure is not a
 * class method, so the test reconstructs its logic via a pure helper — same
 * pattern as `tests/plugin/main.chat-handlers.test.ts`.
 *
 * Asserts that the v2 reroute (IDEA-ASV-001) survives: `open-chat`,
 * `focus-chat`, and the new `open-agent` alias all dispatch to the agent
 * sidepanel rather than the legacy `/chat` route. Codex P1 finding from
 * PR #369 review (no test covered the new routing).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

interface DispatchSpies {
	activateAgentSidepanel: Mock<() => Promise<void>>;
	showInfo: Mock<(message: string) => void>;
	showWarning: Mock<(message: string) => void>;
	coreHandleUri: Mock<(params: URLSearchParams) => boolean>;
}

/**
 * Mirrors the closure registered in `main.ts` at the
 * `registerObsidianProtocolHandler('specorator', ...)` site. Kept in sync with
 * the production closure manually; the test is the regression guard.
 */
function dispatchUriAction(params: Record<string, string>, spies: DispatchSpies): void {
	const searchParams = new URLSearchParams(Object.entries(params));
	if (spies.coreHandleUri(searchParams) === true) return;

	const action = params.action;
	if (action === 'open-chat' || action === 'focus-chat' || action === 'open-agent') {
		void spies.activateAgentSidepanel();
		return;
	}
	if (action === 'send-message' || action === 'open-workflow') {
		spies.showInfo(`URI action "${action}" is not yet implemented.`);
		return;
	}
	spies.showWarning(`Unknown Specorator URI action: "${action}"`);
}

function makeSpies(): DispatchSpies {
	return {
		activateAgentSidepanel: vi.fn(async (): Promise<void> => undefined),
		showInfo: vi.fn((_message: string): void => undefined),
		showWarning: vi.fn((_message: string): void => undefined),
		coreHandleUri: vi.fn((_params: URLSearchParams): boolean => false),
	};
}

describe('specorator:// URI handler routes to AgentSidepanelView', () => {
	let spies: DispatchSpies;

	beforeEach(() => {
		spies = makeSpies();
	});

	it('action=open-chat activates the agent sidepanel (legacy URI preserved)', () => {
		dispatchUriAction({ action: 'open-chat' }, spies);
		expect(spies.activateAgentSidepanel).toHaveBeenCalledTimes(1);
		expect(spies.showInfo).not.toHaveBeenCalled();
		expect(spies.showWarning).not.toHaveBeenCalled();
	});

	it('action=focus-chat activates the agent sidepanel (legacy URI preserved)', () => {
		dispatchUriAction({ action: 'focus-chat' }, spies);
		expect(spies.activateAgentSidepanel).toHaveBeenCalledTimes(1);
	});

	it('action=open-agent activates the agent sidepanel (new alias)', () => {
		dispatchUriAction({ action: 'open-agent' }, spies);
		expect(spies.activateAgentSidepanel).toHaveBeenCalledTimes(1);
	});

	it('none of the chat actions surface the legacy /chat-route notice', () => {
		// The pre-v2 handler showed "URI action open-chat is not yet implemented"
		// for some branches; the rewrite must not regress to that.
		for (const action of ['open-chat', 'focus-chat', 'open-agent']) {
			const localSpies = makeSpies();
			dispatchUriAction({ action }, localSpies);
			expect(localSpies.showInfo).not.toHaveBeenCalled();
		}
	});

	it('action=send-message surfaces an info notice (deferred feature)', () => {
		dispatchUriAction({ action: 'send-message' }, spies);
		expect(spies.activateAgentSidepanel).not.toHaveBeenCalled();
		expect(spies.showInfo).toHaveBeenCalledWith(
			'URI action "send-message" is not yet implemented.',
		);
	});

	it('action=open-workflow surfaces an info notice (deferred feature)', () => {
		dispatchUriAction({ action: 'open-workflow' }, spies);
		expect(spies.showInfo).toHaveBeenCalledWith(
			'URI action "open-workflow" is not yet implemented.',
		);
	});

	it('unknown action surfaces a warning notice', () => {
		dispatchUriAction({ action: 'something-weird' }, spies);
		expect(spies.activateAgentSidepanel).not.toHaveBeenCalled();
		expect(spies.showInfo).not.toHaveBeenCalled();
		expect(spies.showWarning).toHaveBeenCalledWith(
			'Unknown Specorator URI action: "something-weird"',
		);
	});

	it('core.handleUri short-circuits the dispatch (module URI actions win)', () => {
		spies.coreHandleUri = vi.fn(() => true);
		dispatchUriAction({ action: 'open-chat' }, spies);
		expect(spies.activateAgentSidepanel).not.toHaveBeenCalled();
		expect(spies.showInfo).not.toHaveBeenCalled();
		expect(spies.showWarning).not.toHaveBeenCalled();
	});
});
