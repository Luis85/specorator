/**
 * Runs `action` when the keydown is a button-activation key (Enter or Space),
 * mirroring native `<button>` semantics for `role="button"` elements. Shared by
 * the shell header widgets and the tab-chrome island (previously four private
 * copies). Callers needing propagation control add Vue's `.stop` modifier at
 * the binding site.
 */
export function onActivationKey(e: KeyboardEvent, action: () => void): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}
