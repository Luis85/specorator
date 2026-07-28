import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { useTeamChatStore } from '@/features/teamChat/ui/vue/stores/teamChatStore';

import { agent, awaitRoster, makeCallbacks, makePlugin, mountRoot } from './fixtures';

/**
 * The rail's responsive collapse, driven through a REAL `ResizeObserver` rather than by
 * poking the store: the bug this file exists for lived at the call site, not in the setter.
 *
 * jsdom ships no `ResizeObserver` and `TeamChatRoot` skips the observer entirely when it is
 * absent, so the stub below is what makes this path testable at all.
 */

vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;

let emitResize: ResizeCallback | null = null;
const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

beforeEach(() => {
  emitResize = null;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(callback: ResizeCallback) { emitResize = callback; }
    observe(): void { /* the test drives the callback directly */ }
    disconnect(): void { /* no-op */ }
  };
});

afterEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
});

function resizeTo(width: number): void {
  emitResize?.([{ contentRect: { width } }]);
}

const TEAM = [agent('roster:a', 'Ada'), agent('roster:b', 'Bo')];

describe('rail responsive collapse (ResizeObserver wiring)', () => {
  it('collapses the rail once the leaf measures below the narrow threshold', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();

    resizeTo(600);
    await nextTick();

    expect(store.railIsCollapsed).toBe(true);
    expect(store.railCollapsed).toBe(false); // the PREFERENCE is untouched
  });

  // Round-71: a hidden or deferred leaf reports 0. Folding that into the narrow boolean
  // looked equivalent to ignoring it, but `false` is a threshold CROSSING for a narrow leaf:
  // the rail flipped open while hidden AND the crossing discarded the user's in-session
  // expand-override, so the next real measurement re-collapsed a rail they had opened.
  it('ignores a zero-width measurement instead of reporting "not narrow"', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();
    resizeTo(600);
    await nextTick();

    resizeTo(0); // the leaf is hidden / deferred — no measurement, not a widening
    await nextTick();

    expect(store.railIsCollapsed).toBe(true); // held, not flipped open
  });

  it('keeps a manual expand-override alive across a zero-width blip', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();
    resizeTo(600);
    await nextTick();
    store.toggleRail(); // the user expands the auto-collapsed rail
    expect(store.railIsCollapsed).toBe(false);

    resizeTo(0);        // hidden…
    await nextTick();
    resizeTo(600);      // …then measured again at the same narrow width
    await nextTick();

    // Their expansion survives: nothing about being hidden was a threshold crossing.
    expect(store.railIsCollapsed).toBe(false);
  });

  // The override is still layout state — a REAL crossing must drop it.
  it('drops the override when the leaf genuinely widens and narrows again', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();
    resizeTo(600);
    await nextTick();
    store.toggleRail();

    resizeTo(1200); // genuinely wide
    await nextTick();
    resizeTo(600);  // and narrow again
    await nextTick();

    expect(store.railIsCollapsed).toBe(true);
  });
});
