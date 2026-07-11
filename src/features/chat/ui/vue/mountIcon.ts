import { setIcon } from 'obsidian';

/** setIcon host guarded on nodeType (not instanceof HTMLElement): in an Obsidian
 *  popout the element belongs to the popout window, whose HTMLElement is a
 *  different constructor. nodeType === 1 is an Element in any window. */
export function mountIcon(el: unknown, icon: string): void {
  if (el == null || (el as Partial<Node>).nodeType !== 1) return;
  setIcon(el as HTMLElement, icon);
}
