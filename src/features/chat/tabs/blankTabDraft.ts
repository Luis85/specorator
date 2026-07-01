import type { TabData } from './types';

/**
 * A blank tab carries pending user work when its composer has unsent text or any
 * file/folder/image context is attached. Programmatic dispatch (quick actions,
 * loop prompts, library skill sends) switches to the target and sends content —
 * `buildOutgoingTurn` consumes and clears those pills — so reusing such a tab
 * would silently steal the user's draft. Callers must only reuse draft-free
 * blanks. Defensive optional access keeps this usable against partial test tabs.
 */
export function blankTabHasPendingDraft(tab: TabData): boolean {
  const draftText = tab.dom?.inputEl?.value;
  if (typeof draftText === 'string' && draftText.trim()) return true;
  const fileContext = tab.ui?.fileContextManager;
  if (fileContext
    && (fileContext.getAttachedFiles().size > 0 || fileContext.getAttachedFolders().size > 0)) {
    return true;
  }
  return Boolean(tab.ui?.imageContextManager?.hasImages());
}
