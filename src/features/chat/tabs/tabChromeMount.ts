import { type Component, Notice } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { BashOutputStore } from '../state/BashOutputStore';
import { mountTabChromeApp } from '../ui/vue/tabChrome/mountTabChromeApp';
import type { TabChromeCallbacks } from '../ui/vue/tabChrome/tabChromeCallbacks';
import { TabChromeProjection } from './tabChrome';
import type { TabData } from './types';

/**
 * Mounts the Vue tab-chrome island for one tab and wires the engine↔island seam.
 * Called by `TabManager` BETWEEN `createTab` and `initializeTabUI` (like
 * `mountTabComposer`), so `tab.bashOutputs` exists before the bang-bash manager
 * (built in `initializeTabUI`) closes over it, and `statusPanelContainerEl`
 * (from `buildTabDOM`) is a live mount target. Mirrors `mountTabComposer`.
 */
export function mountTabChrome(
  tab: TabData,
  plugin: SpecoratorPlugin,
  component: Component,
): void {
  // onChange fires the projection emit (mirror of ComposerDropdownCoordinator's
  // `() => tab.composer?.emit()`); tab.tabChrome is set immediately below, and no
  // bash write happens synchronously during construction.
  tab.bashOutputs = new BashOutputStore(() => tab.tabChrome?.emit());
  tab.tabChrome = new TabChromeProjection(tab);

  const callbacks: TabChromeCallbacks = {
    subscribe: tab.tabChrome.subscribe,
    onCopyBashOutput: () => {
      const latest = tab.bashOutputs?.latest();
      if (!latest) return;
      const output = latest.output?.trim() || (latest.status === 'running' ? t('chat.bangBash.running') : '');
      const text = output ? `$ ${latest.command}\n${output}` : `$ ${latest.command}`;
      void navigator.clipboard.writeText(text).catch(() => { new Notice(t('chat.bangBash.copyFailed')); });
    },
    onClearBashOutputs: () => { tab.bashOutputs?.clear(); },
    // Phase 4 wires the real teleport host; until then NavOverlay is not rendered,
    // so a null host is harmless.
    resolveNavHost: () => tab.dom.navSidebarHostEl ?? null,
  };

  tab.mountedTabChrome = mountTabChromeApp(tab.dom.statusPanelContainerEl, plugin, component, callbacks);
}
