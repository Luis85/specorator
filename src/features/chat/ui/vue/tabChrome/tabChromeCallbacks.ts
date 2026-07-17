import type { TodoItem } from '../../../../../core/tools/todo';
import type { PanelBashOutput } from '../../../state/BashOutputStore';

/** One projected snapshot pushed on todo change + bash change + conversation switch. */
export interface TabChromeSnapshot {
  todos: TodoItem[] | null;
  bashOutputs: PanelBashOutput[];
}

export type TabChromeSubscribe = (onChange: (s: TabChromeSnapshot) => void) => () => void;

/** Vue → engine seam for the tab-chrome island. Thin delegators; truth stays in
 *  the engine (ChatState / BashOutputStore). `resolveNavHost` returns the
 *  NavOverlay teleport target (Phase 4). */
export interface TabChromeCallbacks {
  subscribe: TabChromeSubscribe;
  /** Copy the latest bang-bash entry to the clipboard (`$ cmd\noutput`). */
  onCopyBashOutput: () => void;
  /** Clear all bang-bash outputs. */
  onClearBashOutputs: () => void;
  /** Teleport target for NavOverlay; null falls back to in-place render. */
  resolveNavHost: () => HTMLElement | null;
}
