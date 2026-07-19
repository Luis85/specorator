import { render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { useMarketplaceInstalledRefresh } from '@/features/marketplace/vue/useMarketplaceInstalledRefresh';

type VaultHandler = (file: { path?: string }, oldPath?: string) => void;

// Capture-and-fire fakes for the two mutation channels the composable spans: the
// event bus (agents) and Obsidian vault events (loop/template/quick-action notes).
function makeFakes() {
  const rosterHandlers: Array<() => void> = [];
  const rosterDisposer = vi.fn();
  const settingsHandlers: Array<() => void> = [];
  const settingsDisposer = vi.fn();
  const vaultSkillHandlers: Array<() => void> = [];
  const vaultSkillDisposer = vi.fn();
  const vaultHandlers: Record<string, VaultHandler[]> = {};
  const offref = vi.fn();
  const plugin = {
    settings: {
      agentBoardLoopFolder: 'Agent Board/loops',
      agentBoardTemplateFolder: 'Agent Board/templates',
      quickActionsFolder: 'Quick Actions',
    },
    events: {
      on: vi.fn((name: string, handler: () => void) => {
        if (name === 'roster:changed') {
          rosterHandlers.push(handler);
          return rosterDisposer;
        }
        if (name === 'settings-changed') {
          settingsHandlers.push(handler);
          return settingsDisposer;
        }
        if (name === 'vaultSkill.changed') {
          vaultSkillHandlers.push(handler);
          return vaultSkillDisposer;
        }
        return vi.fn();
      }),
    },
    app: {
      vault: {
        on: vi.fn((name: string, handler: VaultHandler) => {
          (vaultHandlers[name] ??= []).push(handler);
          return { name };
        }),
        offref,
      },
    },
  };
  const fireRoster = (): void => rosterHandlers.forEach((handler) => handler());
  const fireSettings = (): void => settingsHandlers.forEach((handler) => handler());
  const fireVaultSkill = (): void => vaultSkillHandlers.forEach((handler) => handler());
  const fireVault = (name: string, path: string, oldPath?: string): void =>
    (vaultHandlers[name] ?? []).forEach((handler) => handler({ path }, oldPath));
  return {
    plugin,
    fireRoster,
    fireSettings,
    fireVaultSkill,
    fireVault,
    rosterDisposer,
    settingsDisposer,
    vaultSkillDisposer,
    offref,
  };
}

function mountComposable(plugin: unknown, refresh: () => void) {
  const Comp = defineComponent({
    setup() {
      useMarketplaceInstalledRefresh(plugin as never, refresh);
      return () => h('div');
    },
  });
  return render(Comp);
}

describe('useMarketplaceInstalledRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('refreshes (debounced) when the roster changes', () => {
    const refresh = vi.fn();
    const { plugin, fireRoster } = makeFakes();
    mountComposable(plugin, refresh);

    fireRoster();
    expect(refresh).not.toHaveBeenCalled(); // still within the debounce window
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes (debounced) on settings-changed (a watched install folder moved)', () => {
    // Changing agentBoardLoopFolder / templateFolder / quickActionsFolder moves
    // where items live with no vault event, so the badge scan must re-run.
    const refresh = vi.fn();
    const { plugin, fireSettings } = makeFakes();
    mountComposable(plugin, refresh);

    fireSettings();
    expect(refresh).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes (debounced) on vaultSkill.changed (a project skill added/removed)', () => {
    // Skill roots are dot-folders Obsidian doesn't emit vault events for, so a
    // Library skill delete/rename reaches the badge scan via the event bus.
    const refresh = vi.fn();
    const { plugin, fireVaultSkill } = makeFakes();
    mountComposable(plugin, refresh);

    fireVaultSkill();
    expect(refresh).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes on a vault delete under a watched folder, ignores others', () => {
    const refresh = vi.fn();
    const { plugin, fireVault } = makeFakes();
    mountComposable(plugin, refresh);

    fireVault('delete', 'Quick Actions/foo.md');
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);

    // A change outside every watched folder must not refresh.
    fireVault('delete', 'Notes/unrelated.md');
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes on a rename OUT of a watched folder (via oldPath)', () => {
    const refresh = vi.fn();
    const { plugin, fireVault } = makeFakes();
    mountComposable(plugin, refresh);

    // New path isn't watched, but the old one was — a move out must still refresh.
    fireVault('rename', 'Notes/moved.md', 'Agent Board/loops/moved.md');
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of mutations into a single refresh', () => {
    const refresh = vi.fn();
    const { plugin, fireVault, fireRoster } = makeFakes();
    mountComposable(plugin, refresh);

    fireVault('create', 'Agent Board/loops/a.md');
    fireVault('create', 'Agent Board/templates/b.md');
    fireRoster();
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('releases bus + vault subscriptions and cancels a pending refresh on unmount', () => {
    const refresh = vi.fn();
    const { plugin, fireRoster, rosterDisposer, settingsDisposer, vaultSkillDisposer, offref } =
      makeFakes();
    const { unmount } = mountComposable(plugin, refresh);

    fireRoster(); // schedules a refresh (timer pending)
    unmount();

    expect(rosterDisposer).toHaveBeenCalledTimes(1);
    expect(settingsDisposer).toHaveBeenCalledTimes(1);
    expect(vaultSkillDisposer).toHaveBeenCalledTimes(1);
    expect(offref).toHaveBeenCalledTimes(3); // create / delete / rename
    // The pending debounce was cleared on unmount, so nothing fires late.
    vi.advanceTimersByTime(300);
    expect(refresh).not.toHaveBeenCalled();
  });
});
