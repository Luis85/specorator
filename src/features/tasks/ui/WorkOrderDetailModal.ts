import { type App, Component, Modal } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import { t } from '../../../i18n/i18n';
import { formatRelativeTime } from '../../../utils/date';
import { type PersonaResolver } from '../../agents/personaRegistry';
import type { TaskPriority, TaskSpec, TaskStatus } from '../model/taskTypes';
import {
  DETAIL_APP_KEY,
  DETAIL_CALLBACKS_KEY,
  DETAIL_CLOSE_KEY,
  DETAIL_MD_COMPONENT_KEY,
  DETAIL_TASK_KEY,
} from './vue/detailKeys';
import WorkOrderDetailRoot from './vue/WorkOrderDetailRoot.vue';
import type { WorkOrderSectionUpdate } from './workOrderEditForm';

export interface WorkOrderFieldUpdate {
  title?: string;
  /** Assigned Agents persona id. */
  agent?: string;
  provider?: string;
  model?: string;
  priority?: TaskPriority;
  /** Attached loop slug; empty string detaches. */
  loop?: string;
}

export interface WorkOrderOption {
  value: string;
  label: string;
}

export interface WorkOrderDetailModalCallbacks {
  onOpenNote(task: TaskSpec): void;
  onOpenConversation?: (task: TaskSpec) => void;
  /** Whether the linked conversation still exists and can be opened. Hides the button when false. */
  canOpenConversation?(task: TaskSpec): boolean;
  onRun?(task: TaskSpec): void;
  onStop?(task: TaskSpec): void;
  onAccept?(task: TaskSpec): void;
  onRework?(task: TaskSpec): void;
  onMarkReady?(task: TaskSpec): void;
  onReopen?(task: TaskSpec): void;
  /** needs_handoff → review: salvage a run that finished without a structured handoff. */
  onSendToReview?(task: TaskSpec): void;
  /** needs_handoff → failed: give up on a run that finished without a structured handoff. */
  onMarkFailed?(task: TaskSpec): void;
  onArchive?(task: TaskSpec): void;
  onSaveFields?(task: TaskSpec, fields: WorkOrderFieldUpdate): void | Promise<void>;
  /**
   * Persist the editable body sections (Objective / Acceptance / Context /
   * Constraints) collected from the modal's inline edit form. Wired only for the
   * editable statuses (inbox / ready / needs_fix); absent when the surface is
   * read-only.
   */
  onSaveSections?(task: TaskSpec, sections: WorkOrderSectionUpdate): void | Promise<void>;
  getProviderOptions(): WorkOrderOption[];
  getModelOptions(providerId: string): WorkOrderOption[];
  /**
   * Open the loop picker for this task, persist the choice, and resolve to the
   * new loop slug (`''` when detached) or `undefined` when cancelled — so the
   * caller can update the (non-native) loop chip in place.
   */
  onPickLoop?(task: TaskSpec): Promise<string | undefined>;
  /** Resolve the task's attached loop slug to a display name (sync, best-effort). */
  getLoopName?(loopId: string | undefined): string | undefined;
  /**
   * Combined persona + roster agent options for the agent picker. Preloaded at
   * modal-open time by the caller so the agent row stays synchronous.
   * Both personas and roster agents are labelled by their plain name.
   */
  getAgentOptions(): WorkOrderOption[];
  /**
   * Resolves an `agent` id to the persona whose avatar the row renders. Preloaded
   * by the caller (mirrors `getAgentOptions`); when omitted the row falls back to
   * the module `resolvePersona` (built-in personas only).
   */
  resolvePersona?: PersonaResolver;
}

// Statuses whose title can still be renamed inline. Every other status
// (running + terminal/review states) renders the title as plain text.
const EDITABLE_TITLE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'inbox',
  'ready',
  'needs_fix',
]);

// The detail modal is a singleton (one work order open at a time), so a stable
// id is safe to use as the dialog's `aria-labelledby` target.
const TITLE_ID = 'specorator-work-order-modal-title';

export class WorkOrderDetailModal extends Modal {
  // Markdown-lifecycle component loaded for the whole open session and provided
  // to the Vue island so every `MarkdownRenderer.render` inside it (objective /
  // acceptance / handoff bodies) tears down when the modal closes.
  private readonly markdownComponent = new Component();

  // The Vue island mounted into `contentEl`. The shell (modalEl classes/CSS vars)
  // and the pinned header stay imperative; the body + footer are Vue-owned.
  private vueApp: VueApp | null = null;

  constructor(
    app: App,
    private readonly task: TaskSpec,
    private readonly callbacks: WorkOrderDetailModalCallbacks,
  ) {
    super(app);
  }

  onOpen(): void {
    this.markdownComponent.load();
    this.modalEl.addClass('specorator-work-order-modal');
    // Size the modal through the variables Obsidian's own `.modal` rule consumes
    // so the height cap applies regardless of how the active theme out-specifies
    // a bare `.modal` selector. Writing them on modalEl is the most reliable
    // hook; the CSS mirrors these as a fallback.
    this.modalEl.setCssProps({
      '--modal-max-height': 'min(86vh, 760px)',
      '--dialog-max-height': 'min(86vh, 760px)',
      '--modal-width': 'min(960px, 92vw)',
      '--dialog-width': 'min(960px, 92vw)',
      '--modal-max-width': 'min(960px, 92vw)',
      '--dialog-max-width': 'min(960px, 92vw)',
    });

    // Pinned header → the NATIVE modal header. `this.titleEl` is Obsidian's
    // `.modal-title`, which sits inside a `.modal-header` that is a SIBLING of
    // `.modal-content` — so it stays pinned above the scrolling content without a
    // custom sticky layer, and we reuse the native chrome instead of duplicating
    // it. The body + footer live in the scrolling content, owned by the Vue island.
    const header = this.titleEl;
    header.addClass('specorator-work-order-modal-header');
    this.renderHeader(header);

    this.contentEl.addClass('specorator-work-order-modal-content');
    // Mount the Vue island into contentEl. It owns the body (main + sidebar),
    // the footer, and the inline-edit toggle. Obsidian objects are large/cyclic,
    // so callbacks / app / markdown component are markRaw'd; the task is plain
    // data provided as-is so the callbacks receive the same object identity.
    const app = createApp(WorkOrderDetailRoot);
    app.provide(DETAIL_TASK_KEY, this.task);
    app.provide(DETAIL_CALLBACKS_KEY, markRaw(this.callbacks));
    app.provide(DETAIL_APP_KEY, markRaw(this.app));
    app.provide(DETAIL_MD_COMPONENT_KEY, markRaw(this.markdownComponent));
    app.provide(DETAIL_CLOSE_KEY, () => this.close());
    app.mount(this.contentEl);
    this.vueApp = app;
  }

  onClose(): void {
    // Vue teardown first (runs onUnmounted hooks + drops mounted markdown), then
    // the markdown component + the content shell.
    this.vueApp?.unmount();
    this.vueApp = null;
    this.markdownComponent.unload();
    this.contentEl.empty();
  }

  /**
   * Pinned header: a meta row (ID chip + status-aware caption), the work-order
   * title (inline-editable in editable states), a left-anchored 2px accent
   * gradient keyed off the status→color contract, and a top-right close button.
   * The header owns the title — the native modal title stays empty.
   */
  private renderHeader(header: HTMLElement): void {
    const { status } = this.task.frontmatter;
    header.addClass(`specorator-work-order-modal-header--${status}`);

    this.renderHeaderMeta(header);
    this.renderHeaderTitle(header);
    // Closing is handled by Obsidian's built-in modal close button — no custom
    // reimplementation of core chrome.
  }

  /**
   * Meta row above the title: the monospace ID chip plus a status-aware
   * caption — a pulsing live dot + "Started … ago" while running, or a
   * "Finished … ago" caption once done. Captions are omitted when the backing
   * timestamp is missing or unparseable.
   */
  private renderHeaderMeta(header: HTMLElement): void {
    const fm = this.task.frontmatter;
    const meta = header.createDiv({ cls: 'specorator-work-order-modal-header-meta' });

    const chip = meta.createSpan({
      cls: 'specorator-work-order-modal-id-chip specorator-work-order-modal-mono',
      text: fm.id,
    });
    chip.setAttr('title', fm.id);
    chip.setAttr('aria-label', fm.id);

    if (fm.status === 'running') {
      const started = formatRelativeTime(fm.started);
      if (started) {
        const live = meta.createSpan({ cls: 'specorator-work-order-modal-header-live' });
        live.createSpan({ cls: 'specorator-work-order-modal-live-dot' }).setAttr('aria-hidden', 'true');
        live.createSpan({ text: t('tasks.workOrderModal.startedAgo', { ago: started }) });
      }
      return;
    }

    if (fm.status === 'done') {
      const finished = formatRelativeTime(fm.finished);
      if (finished) {
        meta.createSpan({
          cls: 'specorator-work-order-modal-header-sub',
          text: t('tasks.workOrderModal.finishedAt', { ago: finished }),
        });
      }
    }
  }

  /**
   * Work-order title. In editable states (inbox / ready / needs_fix) it is a
   * keyboard-focusable `contenteditable="plaintext-only"` element (the
   * plaintext clamp blocks rich-paste DOM injection into a plain-text field):
   * Enter commits (blur), Esc reverts to the original and blurs, and a blur
   * with a changed, non-empty value persists through `onSaveFields`. Every other
   * status renders plain, static text.
   */
  private renderHeaderTitle(header: HTMLElement): void {
    const { task } = this;
    const original = task.frontmatter.title;
    const editable = EDITABLE_TITLE_STATUSES.has(task.frontmatter.status);

    const title = header.createDiv({ cls: 'specorator-work-order-modal-title' });
    title.setText(original);
    // The custom header replaces the native modal title, so expose the dialog's
    // accessible name through this element via `aria-labelledby`.
    title.setAttr('id', TITLE_ID);
    this.modalEl.setAttribute('aria-labelledby', TITLE_ID);

    if (!editable) {
      // A static (non-editable) title also doubles as the dialog heading.
      title.setAttr('role', 'heading');
      title.setAttr('aria-level', '2');
      return;
    }

    title.addClass('is-editable');
    title.setAttr('contenteditable', 'plaintext-only');
    title.setAttr('tabindex', '0');
    title.setAttr('spellcheck', 'false');

    // `committed` tracks the last persisted value so a re-blur (e.g. Enter →
    // blur) does not double-save, and Esc's revert is measured against it.
    let committed = original;

    const commit = (): void => {
      // Collapse whitespace runs — including newlines from a multi-line paste,
      // which the plaintext-only field still accepts — so the title stays a
      // single line (a multi-line value would break the frontmatter + body H1).
      const next = (title.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (next.length === 0 || next === committed) {
        // Reject empty/unchanged edits, but restore the displayed text so the
        // header never lingers in a blank or stray-whitespace unsaved state.
        title.setText(committed);
        return;
      }
      committed = next;
      // Reflect the normalized single-line value back into the field.
      title.setText(next);
      void this.callbacks.onSaveFields?.(task, { title: next });
    };

    title.addEventListener('blur', commit);
    title.addEventListener('keydown', (evt) => {
      const event = evt;
      // While an IME composition is active, Enter/Escape belong to the IME
      // (confirm / cancel the candidate) — don't treat them as commit/revert.
      if (event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        title.blur();
      } else if (event.key === 'Escape') {
        title.setText(committed);
        title.blur();
      }
    });
  }
}
