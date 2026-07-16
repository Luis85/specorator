import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { Component } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigationController } from '@/features/chat/controllers/NavigationController';
import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import { wireTabInputEvents } from '@/features/chat/tabs/tabInputWiring';
import type { TabData } from '@/features/chat/tabs/types';
import { SlashCommandDropdown } from '@/shared/components/SlashCommandDropdown';

import { makePlugin, makeTab } from './_kit';

// The projection derives its wrapper-mode + toolbar slices from these; stub so
// the mount needs no real provider wiring (mirrors tabComposerMount.test.ts).
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: () => 'normal',
  // `supportsInstructionMode` absent → tabInputWiring skips the instruction-mode
  // branches and reaches the send / dropdown handlers.
  getTabCapabilities: () => ({ supportsPlanMode: true }),
  getTabSettingsSnapshot: () => ({ model: '', thinkingBudget: '', effortLevel: '', serviceTier: '', permissionMode: 'normal' }),
  getTabChatUIConfig: () => ({ getModelOptions: () => [] }),
  getProviderMcpManager: () => null,
}));

/**
 * End-to-end keyboard-routing parity for the chat slash dropdown after the
 * Phase-5 Vue migration. This drives the REAL engine keydown path:
 *   real `SlashCommandDropdown` detector (coordinator-injected, no DOM render)
 *   → real `ComposerDropdownCoordinator` (constructed by `mountTabComposer`)
 *   → real `TabComposerProjection` → the mounted Vue composer store/components.
 * Nothing here is stubbed except the tab's provider wiring (`tabShared`) and the
 * `inputController` spies from `_kit` (`sendMessage` is the send-vs-select probe).
 *
 * `store.dropdown` is projected verbatim from `coordinator.getState()`
 * (`TabComposerProjection.buildDropdown`), so each assertion checks BOTH the
 * coordinator state AND the rendered Vue DOM to prove the projection reached the
 * island.
 */
describe('composer slash dropdown keyboard routing', () => {
  let tab: TabData;
  let plugin: ReturnType<typeof makePlugin>;
  let slashDropdown: SlashCommandDropdown;
  let nav: NavigationController;
  let host: HTMLElement;

  // The wired-dep predicate lifted verbatim from tabControllerSetup's
  // `buildTabNavigationController` — Escape must be skipped (dropdown dismisses)
  // before the nav controller blurs the textarea.
  const shouldSkipEscapeHandling = (): boolean => {
    if (tab.ui.instructionModeManager?.isActive()) return true;
    if (tab.ui.bangBashModeManager?.isActive()) return true;
    if (tab.controllers.inputController?.isResumeDropdownVisible()) return true;
    if (tab.ui.slashCommandDropdown?.isVisible()) return true;
    if (tab.ui.fileContextManager?.isMentionDropdownVisible()) return true;
    return false;
  };

  function inputEl(): HTMLTextAreaElement {
    return tab.dom.inputEl as HTMLTextAreaElement;
  }

  function slashItems(): NodeListOf<HTMLElement> {
    return host.querySelectorAll<HTMLElement>('.specorator-slash-item');
  }

  /** Type raw text into the Vue textarea and fire the real `input` handler. */
  async function typeInput(value: string): Promise<void> {
    const el = inputEl();
    el.value = value;
    el.selectionStart = el.selectionEnd = value.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
  }

  /** Dispatch a bubbling+cancelable keydown on the textarea; return the event. */
  function keydown(key: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    inputEl().dispatchEvent(e);
    return e;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tab = makeTab();
    plugin = makePlugin();
    host = tab.dom.composerHostEl;

    // Mount the real composer island first: this constructs
    // `composerDropdownCoordinator` + `TabComposerProjection` and repoints
    // `tab.dom.inputEl` at the Vue-rendered <textarea>.
    mountTabComposer(tab, plugin, new Component());
    await flushPromises();

    // Real detector wired to the real coordinator (chat delegation path — no DOM
    // render). No providerConfig → built-in commands only, resolved synchronously.
    slashDropdown = new SlashCommandDropdown(
      tab.dom.inputContainerEl,
      inputEl(),
      { onSelect: () => {}, onHide: () => {} },
      { coordinator: tab.controllers.composerDropdownCoordinator ?? undefined },
    );
    tab.ui.slashCommandDropdown = slashDropdown;
    // Resume-visibility probe the escape predicate calls (not under test here).
    tab.controllers.inputController!.isResumeDropdownVisible = vi.fn(() => false);

    wireTabInputEvents(tab, plugin);

    nav = new NavigationController({
      getMessagesEl: () => tab.dom.messagesEl,
      getInputEl: () => inputEl(),
      getSettings: () => ({ scrollUpKey: 'k', scrollDownKey: 'j', focusInputKey: 'i' }) as never,
      isStreaming: () => tab.state.isStreaming,
      shouldSkipEscapeHandling,
    });
    nav.initialize();
  });

  afterEach(() => {
    nav.dispose();
    slashDropdown.destroy();
    tab.mountedComposer?.unmount();
    tab.dom.contentEl.remove();
  });

  it('routes Arrow/Enter/Escape through the engine keydown path: select-not-send, dismiss-not-blur', async () => {
    const coordinator = tab.controllers.composerDropdownCoordinator!;

    // 1. Type `/` → the detector opens a slash dropdown projected into store.dropdown.
    await typeInput('/');
    expect(coordinator.getState().kind).toBe('slash');
    expect(coordinator.getState().items.length).toBeGreaterThan(1);
    // Rendered in the Vue island (store.dropdown reached the components).
    expect(host.querySelector('.specorator-slash-dropdown.visible')).not.toBeNull();
    expect(slashItems().length).toBe(coordinator.getState().items.length);
    // Built-ins are sorted; index 1 is `/clear`.
    expect(slashItems()[1].textContent).toContain('/clear');

    // 2. ArrowDown → activeIndex increments AND the detector consumed the key.
    const handleKeydownSpy = vi.spyOn(slashDropdown, 'handleKeydown');
    const down = keydown('ArrowDown');
    await flushPromises();
    expect(coordinator.getState().activeIndex).toBe(1);
    expect(handleKeydownSpy.mock.results.at(-1)?.value).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    // The Vue `.selected` marker followed the projected activeIndex.
    expect(host.querySelector('.specorator-slash-item.selected')?.textContent).toContain('/clear');

    // 3. Enter → inserts the active command, closes the dropdown, and does NOT send.
    keydown('Enter');
    await flushPromises();
    expect(inputEl().value).toBe('/clear ');
    expect(coordinator.getState().kind).toBeNull();
    expect(host.querySelector('.specorator-slash-dropdown.visible')).toBeNull();
    expect(tab.controllers.inputController!.sendMessage).not.toHaveBeenCalled();

    // 4. Re-open, then Escape → dismisses (kind null) WITHOUT blurring the textarea.
    await typeInput('/');
    expect(coordinator.getState().kind).toBe('slash');
    // 5. The wired escape predicate reflects coordinator visibility.
    expect(shouldSkipEscapeHandling()).toBe(true);

    inputEl().focus();
    expect(inputEl().ownerDocument.activeElement).toBe(inputEl());
    keydown('Escape');
    await flushPromises();
    expect(coordinator.getState().kind).toBeNull();
    // NavigationController's capture-phase Escape handler saw the dropdown visible
    // and skipped the blur; focus stayed on the composer textarea.
    expect(inputEl().ownerDocument.activeElement).toBe(inputEl());
    expect(shouldSkipEscapeHandling()).toBe(false);
    expect(tab.controllers.inputController!.sendMessage).not.toHaveBeenCalled();
  });
});
