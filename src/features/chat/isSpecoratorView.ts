import type { ChatViewHandle } from '../../core/types/PluginContext';
import type { SpecoratorView } from './SpecoratorView';

/**
 * Structural predicate for `SpecoratorView` leaves.
 *
 * Used wherever code looks up a chat-view leaf via `workspace.getLeavesOfType`
 * and needs to access `SpecoratorView`-specific methods without an unchecked
 * cast. Duck-typed against `getTabManager` so the predicate has no runtime
 * dependency on the `SpecoratorView` class (avoids cycles between `main.ts`
 * and feature modules).
 *
 * Pair with `leaf.loadIfDeferred()` before the predicate when the leaf may
 * still be a placeholder — Obsidian's deferred-view feature can hand back a
 * leaf whose `view` is a stub until the user activates it.
 */
export function isSpecoratorView(value: unknown): value is SpecoratorView {
  return !!value
    && typeof value === 'object'
    && typeof (value as { getTabManager?: unknown }).getTabManager === 'function';
}

/**
 * Host-agnostic structural predicate for any chat-engine host (`ChatViewHandle`).
 *
 * Same `getTabManager` duck-type as `isSpecoratorView`, but it narrows to the
 * neutral `ChatViewHandle` contract rather than the concrete sidebar
 * `SpecoratorView`, so a `TeamChatView` leaf (its own `VIEW_TYPE_TEAM_CHAT`)
 * also passes. `getAllViews()` filters both host leaf-types through this to
 * enumerate every live chat-engine host; `getView()` stays sidebar-only.
 */
export function isChatViewHandle(value: unknown): value is ChatViewHandle {
  return !!value
    && typeof value === 'object'
    && typeof (value as { getTabManager?: unknown }).getTabManager === 'function';
}
