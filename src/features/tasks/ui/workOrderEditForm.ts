import type { TranslationKey } from '../../../i18n/types';

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

/** One editable body section: which task key it edits + its header/placeholder. */
export interface WorkOrderEditFieldSpec {
  key: keyof WorkOrderSectionUpdate;
  icon: string;
  labelKey: TranslationKey;
  placeholderKey: TranslationKey;
}

/**
 * The four editable body sections, in the same order they read top-to-bottom in
 * the work-order note. Icons match the read-only section headers so the form
 * reads as the same document, just editable. Consumed by the Vue edit form
 * (`WorkOrderEditForm.vue`); the `WorkOrderSectionUpdate` type is also the
 * `onSaveSections` payload shape shared with `TaskNoteStore.writeSections`.
 */
export const WORK_ORDER_EDIT_FIELDS: readonly WorkOrderEditFieldSpec[] = [
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
