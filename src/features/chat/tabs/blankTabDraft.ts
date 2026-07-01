import type { TabData } from './types';

/**
 * Attached file/folder pills or images on a blank tab. This context is NOT
 * survivable across a tab switch: activating a blank tab runs
 * `ConversationController.initializeWelcome`, whose `fileCtx.resetForNewConversation`
 * + `autoAttachActiveFile` clears the user's pills and replaces them with the
 * active note. So NO reuse path — not even additive loop seeding — may reuse a
 * blank holding attached context; doing so silently drops it. Defensive optional
 * access keeps this usable against partial test tabs.
 */
export function blankTabHasAttachedContext(tab: TabData): boolean {
  const fileContext = tab.ui?.fileContextManager;
  if (fileContext
    && (fileContext.getAttachedFiles().size > 0 || fileContext.getAttachedFolders().size > 0)) {
    return true;
  }
  return Boolean(tab.ui?.imageContextManager?.hasImages());
}

/** Unsent composer text on a blank tab. Unlike attached context, the welcome
 * reset leaves the textarea untouched, so additive seeding (`seedComposerDraft`
 * with `keepExisting`) can preserve it — text alone does not block loop reuse. */
export function blankTabHasComposerText(tab: TabData): boolean {
  const draftText = tab.dom?.inputEl?.value;
  return typeof draftText === 'string' && draftText.trim().length > 0;
}

/**
 * A blank tab carries pending user work when its composer has unsent text OR any
 * file/folder/image context is attached. Destructive dispatch (quick actions,
 * library skill sends) switches to the target and sends content —
 * `buildOutgoingTurn` consumes and clears those pills — so reusing such a tab
 * would silently steal the user's draft. Those callers must only reuse fully
 * draft-free blanks.
 */
export function blankTabHasPendingDraft(tab: TabData): boolean {
  return blankTabHasComposerText(tab) || blankTabHasAttachedContext(tab);
}
