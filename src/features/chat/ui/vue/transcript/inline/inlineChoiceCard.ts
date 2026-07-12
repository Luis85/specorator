/**
 * Shared contract for the inline approval cards (plan approval, exit-plan-mode,
 * ask-user-question). The numbered-choice list itself is the `InlineChoiceList.vue`
 * component; this module holds the row spec its host cards build and the shared
 * keyboard-hint text they render.
 */

export const CHOICE_CARD_HINTS_TEXT = 'Arrow keys to navigate · Enter to select · Esc to cancel';

export type InlineChoiceRowSpec =
  | { kind: 'action'; label: string; onSelect: () => void }
  | { kind: 'input'; placeholder: string; onSubmit: (text: string) => void };
