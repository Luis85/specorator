import { render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { useVaultSkillRefresh } from '@/features/library/vue/useVaultSkillRefresh';

// Capture-and-fire fake for the one channel the composable spans: the event bus
// `vaultSkill.changed` (skill roots are dot-folders Obsidian emits no vault
// events for, so the bus is the only in-app signal — same rationale as the
// marketplace installed-refresh composable).
function makeFakes() {
  const handlers: Array<() => void> = [];
  const disposer = vi.fn();
  const plugin = {
    events: {
      on: vi.fn((name: string, handler: () => void) => {
        if (name === 'vaultSkill.changed') {
          handlers.push(handler);
          return disposer;
        }
        return vi.fn();
      }),
    },
  };
  const fire = (): void => handlers.forEach((handler) => handler());
  return { plugin, fire, disposer };
}

function mountComposable(plugin: unknown, reload: () => void) {
  const Comp = defineComponent({
    setup() {
      useVaultSkillRefresh(plugin as never, reload);
      return () => h('div');
    },
  });
  return render(Comp);
}

describe('useVaultSkillRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('reloads (debounced) when a vaultSkill.changed fires', () => {
    const reload = vi.fn();
    const { plugin, fire } = makeFakes();
    mountComposable(plugin, reload);

    fire();
    expect(reload).not.toHaveBeenCalled(); // still within the debounce window
    vi.advanceTimersByTime(300);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of vaultSkill.changed events into a single reload', () => {
    // A marketplace install / plugin toggle can fire several events in a tick;
    // an already-open panel should reload once, not once per event.
    const reload = vi.fn();
    const { plugin, fire } = makeFakes();
    mountComposable(plugin, reload);

    fire();
    fire();
    fire();
    vi.advanceTimersByTime(300);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('releases the bus subscription and cancels a pending reload on unmount', () => {
    const reload = vi.fn();
    const { plugin, fire, disposer } = makeFakes();
    const { unmount } = mountComposable(plugin, reload);

    fire(); // schedules a reload (timer pending)
    unmount();

    expect(disposer).toHaveBeenCalledTimes(1);
    // The pending debounce was cleared on unmount, so nothing fires late.
    vi.advanceTimersByTime(300);
    expect(reload).not.toHaveBeenCalled();
  });
});
