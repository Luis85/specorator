/**
 * `useA11yAnnouncer` — small composable that owns a polite ARIA live region
 * message queue for the agent sidepanel (WP-7, a11y P1 wave). The companion
 * component `A11yAnnouncer.vue` renders the off-screen `role="status"`
 * container; this composable exposes `announce(text)` and the reactive
 * `message` ref the component binds to.
 *
 * Why a composable instead of toggling `aria-live` on the message list:
 * announcing every streamed token to a screen reader is hostile (one-token
 * deltas, repeated whole-message reads). Per the WAI-ARIA APG advice, status
 * announcements should fire ONCE per logically-complete update. The agent
 * sidepanel calls `announce()` from a handful of well-defined event points
 * (turn complete, generation start, proposal decided) rather than letting the
 * browser observe a streaming text node.
 *
 * The composable is intentionally stateless across instances — each consumer
 * gets its own message ref. `A11yAnnouncer.vue` mounts once per agent
 * sidepanel and shares its `announce` handle with the rest of the panel via
 * provide/inject (`A11Y_ANNOUNCER_KEY`).
 *
 * Repeated identical announcements are de-duplicated by clearing the message
 * ref between writes — SRs only re-announce when the text content changes.
 * To force a re-announcement of the same message, the composable resets the
 * ref to an empty string, awaits a microtask, then writes the new text.
 */
import { ref, onBeforeUnmount, inject, type InjectionKey, type Ref } from 'vue';

export interface UseA11yAnnouncer {
	/**
	 * Reactive message text the live region renders. Components bind this
	 * to the off-screen `<div role="status">` content.
	 */
	readonly message: Readonly<Ref<string>>;
	/**
	 * Announce `text` politely. Empty / whitespace-only inputs are ignored.
	 * Consecutive identical messages are re-fired by toggling the ref to
	 * empty on a microtask so the SR observes a change.
	 */
	announce(text: string): void;
	/** Clear any pending message. Called automatically on unmount. */
	clear(): void;
}

export function useA11yAnnouncer(): UseA11yAnnouncer {
	const message = ref<string>('');
	let pendingResetTimer: ReturnType<typeof setTimeout> | null = null;

	function clearPendingTimer(): void {
		if (pendingResetTimer !== null) {
			clearTimeout(pendingResetTimer);
			pendingResetTimer = null;
		}
	}

	function announce(text: string): void {
		const trimmed = text.trim();
		if (trimmed.length === 0) return;
		clearPendingTimer();
		// Clear first so identical messages re-fire (the SR only observes a
		// content change). The microtask delay is enough for the DOM to
		// observe the empty→content transition.
		message.value = '';
		pendingResetTimer = setTimeout(() => {
			pendingResetTimer = null;
			message.value = trimmed;
		}, 0);
	}

	function clear(): void {
		clearPendingTimer();
		message.value = '';
	}

	onBeforeUnmount(() => {
		clear();
	});

	return { message, announce, clear };
}

/**
 * Injection key for the agent sidepanel's shared announcer. The root component
 * (`AgentSidepanelRoot` / `ChatSidebar`) provides one announcer instance via
 * this key; descendants that need to announce (e.g. `MessageList` on turn
 * complete) inject it.
 */
export const A11Y_ANNOUNCER_KEY: InjectionKey<UseA11yAnnouncer> = Symbol('a11y-announcer');

/**
 * Inject the shared announcer or fall back to a fresh local instance. The
 * fallback keeps isolated mount tests (and the agent sidepanel before its
 * root wires up the provide) working without a hard crash. Production code
 * always sees the provided instance.
 */
export function useInjectedA11yAnnouncer(): UseA11yAnnouncer {
	const injected = inject<UseA11yAnnouncer | null>(A11Y_ANNOUNCER_KEY, null);
	if (injected !== null) return injected;
	return useA11yAnnouncer();
}
