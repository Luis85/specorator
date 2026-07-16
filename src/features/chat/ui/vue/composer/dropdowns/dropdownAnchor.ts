import type { ComposerDropdownAnchor } from '../stores/composerStore';

/**
 * Anchors a composer dropdown to the textarea rect. The imperative dropdowns
 * (SlashCommandDropdown / MentionDropdownController / ResumeSessionDropdown)
 * positioned themselves off `inputEl.getBoundingClientRect()`, NOT a per-caret
 * rect — see their `positionFixed`, which set three CSS vars:
 *
 *   --specorator-fixed-dropdown-bottom: `${window.innerHeight - inputRect.top + 4}px`
 *   --specorator-fixed-dropdown-left:   `${inputRect.left}px`
 *   --specorator-fixed-dropdown-width:  `${Math.max(inputRect.width, 280)}px`
 *
 * The dropdown is a drop-UP: it sits above the input, so the imperative CSS var
 * anchored its BOTTOM edge to the input's top (`innerHeight - top + 4`, a 4px
 * gap). This helper carries the raw input `top`/`left`/`width` (width floored at
 * 280 to match `Math.max(width, 280)`); the Vue dropdown host converts
 * `top` into the same bottom-anchored placement + gap. Left and the 280 floor
 * reproduce the imperative values exactly.
 */
export function anchorFromInput(inputEl: HTMLTextAreaElement): ComposerDropdownAnchor {
  const r = inputEl.getBoundingClientRect();
  return { top: r.top, left: r.left, width: Math.max(r.width, 280) };
}

/**
 * Fixed-position CSS vars for the slash + mention dropup, anchored to the
 * textarea rect. Reproduces the imperative `positionFixed` exactly: the dropdown
 * is a drop-UP, so its BOTTOM edge sits `4px` above the input top
 * (`window.innerHeight - top + 4`). `window` matches the imperative code's global
 * reference; `width` is already floored at 280 in `anchorFromInput`. Returns an
 * empty object (no vars) when there is no anchor. Resume does NOT use this — it
 * is a CSS-flow dropup positioned by `bottom: 100%`.
 */
export function fixedDropdownStyleVars(
  anchor: ComposerDropdownAnchor | null,
): Record<string, string> {
  if (!anchor) return {};
  return {
    '--specorator-fixed-dropdown-bottom': `${window.innerHeight - anchor.top + 4}px`,
    '--specorator-fixed-dropdown-left': `${anchor.left}px`,
    '--specorator-fixed-dropdown-width': `${anchor.width}px`,
  };
}
