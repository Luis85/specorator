import type { ImageAttachment } from '@/core/types';

import type { TabData } from './types';

/**
 * User-attached context (files + folders + images) carried from one tab into
 * another for a quick action / library skill. The passive current-note pill is
 * deliberately excluded — see {@link snapshotUserAttachedContext}.
 */
export interface AttachedContextSnapshot {
  files: string[];
  folders: string[];
  images: ImageAttachment[];
}

/**
 * USER-attached file/folder pills or images on a blank tab. This context is NOT
 * survivable across a tab switch: activating a blank tab runs
 * `ConversationController.initializeWelcome`, whose `fileCtx.resetForNewConversation`
 * + `autoAttachActiveFile` clears the user's pills and replaces them with the
 * active note. So NO reuse path — not even additive loop seeding — may reuse a
 * blank holding attached context; doing so silently drops it. Defensive optional
 * access keeps this usable against partial test tabs.
 *
 * The passive current-note pill is EXCLUDED: `autoAttachActiveFile` re-attaches
 * it on the very same welcome reset, so it survives a switch and does not
 * represent user-curated draft context. Counting it made every blank tab opened
 * over an active editor note look "draft-bearing", so quick actions never reused
 * the active tab and spawned a fresh one on each run.
 */
export function blankTabHasAttachedContext(tab: TabData): boolean {
  const fileContext = tab.ui?.fileContextManager;
  if (fileContext) {
    const currentNote = fileContext.getCurrentNotePath?.() ?? null;
    const hasUserFile = [...fileContext.getAttachedFiles()].some((path) => path !== currentNote);
    if (hasUserFile || fileContext.getAttachedFolders().size > 0) {
      return true;
    }
  }
  return Boolean(tab.ui?.imageContextManager?.hasImages());
}

/**
 * Snapshot the files/folders/images a user has attached to a tab so a quick
 * action / library skill that resolves to a DIFFERENT (usually freshly created)
 * tab can re-apply them and still send the context the user set up. Without this
 * the target tab's welcome reset — or simply being a brand-new tab — drops every
 * pill/image the user had attached, so the run goes out with no context.
 *
 * The current-note pill is excluded (the destination auto-attaches its own on
 * activation; carrying a stale one would double up or, after a note switch,
 * point at the wrong note). Defensive optional access tolerates partial mocks.
 */
export function snapshotUserAttachedContext(tab: TabData | null | undefined): AttachedContextSnapshot {
  const fileContext = tab?.ui?.fileContextManager;
  const currentNote = fileContext?.getCurrentNotePath?.() ?? null;
  return {
    files: [...(fileContext?.getAttachedFiles?.() ?? [])].filter((path) => path !== currentNote),
    folders: [...(fileContext?.getAttachedFolders?.() ?? [])],
    images: [...(tab?.ui?.imageContextManager?.getAttachedImages?.() ?? [])],
  };
}

/**
 * Re-apply a snapshot's files/folders (as pills) and images onto `tab`'s context
 * managers. Images are appended to whatever the target already holds (a fresh
 * target holds none). No-op for empty slices.
 */
export function applyUserAttachedContext(
  tab: TabData | null | undefined,
  snapshot: AttachedContextSnapshot,
): void {
  const fileContext = tab?.ui?.fileContextManager;
  if (fileContext) {
    for (const path of snapshot.files) fileContext.attachFileAsPill(path);
    for (const path of snapshot.folders) fileContext.attachFolderAsPill(path);
  }
  const imageContext = tab?.ui?.imageContextManager;
  if (imageContext && snapshot.images.length > 0) {
    imageContext.setImages([...(imageContext.getAttachedImages?.() ?? []), ...snapshot.images]);
  }
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
