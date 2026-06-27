import { t } from '../../../i18n/i18n';
import type { TranslationKey } from '../../../i18n/types';
import type { TaskSpec } from '../model/taskTypes';
import { renderSectionHeader } from './sectionHeader';

/**
 * Editable work-order body sections collected from the detail modal's inline
 * edit form. Mirrors `WriteSectionsOptions` in `TaskNoteStore` so the modal can
 * hand the update straight to the note store. Each provided value replaces the
 * body under the matching `## Heading`.
 */
export interface WorkOrderSectionUpdate {
  objective?: string;
  acceptanceCriteria?: string;
  context?: string;
  constraints?: string;
}

/**
 * Imperative handle the modal keeps after rendering the edit form. The Save /
 * Cancel actions live in the sticky footer (not in the form), so the footer's
 * Save button reaches back through `collect()` to gather the current textarea
 * values on demand.
 */
export interface WorkOrderEditFormHandle {
  /** Snapshot every textarea (a cleared field persists as an empty section). */
  collect(): WorkOrderSectionUpdate;
}

interface FieldSpec {
  key: keyof WorkOrderSectionUpdate;
  icon: string;
  labelKey: TranslationKey;
  placeholderKey: TranslationKey;
}

// The four editable body sections, in the same order they read top-to-bottom in
// the work-order note. Icons match the read-only section headers so the form
// reads as the same document, just editable.
const FIELD_SPECS: readonly FieldSpec[] = [
  {
    key: 'objective',
    icon: 'target',
    labelKey: 'tasks.workOrderModal.sectionObjective',
    placeholderKey: 'tasks.workOrderModal.editObjectivePlaceholder',
  },
  {
    key: 'acceptanceCriteria',
    icon: 'list-checks',
    labelKey: 'tasks.workOrderModal.sectionAcceptance',
    placeholderKey: 'tasks.workOrderModal.editAcceptancePlaceholder',
  },
  {
    key: 'context',
    icon: 'link',
    labelKey: 'tasks.workOrderModal.sectionContext',
    placeholderKey: 'tasks.workOrderModal.editContextPlaceholder',
  },
  {
    key: 'constraints',
    icon: 'shield',
    labelKey: 'tasks.workOrderModal.sectionConstraints',
    placeholderKey: 'tasks.workOrderModal.editConstraintsPlaceholder',
  },
];

/**
 * Renders the work-order detail modal's inline edit form: one raw-markdown
 * textarea per editable body section (Objective, Acceptance Criteria, Context,
 * Constraints) seeded from the task. The Cancel / Save actions are NOT rendered
 * here — they live in the modal's sticky footer; this returns a handle the
 * footer's Save button calls to collect every textarea value at save time (so a
 * cleared field persists as an empty section).
 */
export function renderWorkOrderEditForm(
  parent: HTMLElement,
  task: TaskSpec,
): WorkOrderEditFormHandle {
  const form = parent.createDiv({ cls: 'specorator-work-order-modal-edit-form' });

  const textareas = FIELD_SPECS.map((spec) => {
    const { section } = renderSectionHeader(form, { icon: spec.icon, label: t(spec.labelKey) });
    const textarea = section.createEl('textarea', {
      cls: 'specorator-work-order-modal-edit-textarea',
      attr: { placeholder: t(spec.placeholderKey), spellcheck: 'false' },
    });
    textarea.value = task.sections[spec.key] ?? '';
    return { key: spec.key, textarea };
  });

  return {
    collect: () => {
      const update: WorkOrderSectionUpdate = {};
      for (const field of textareas) update[field.key] = field.textarea.value;
      return update;
    },
  };
}
