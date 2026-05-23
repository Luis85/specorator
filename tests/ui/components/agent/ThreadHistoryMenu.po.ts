/**
 * Page Object for `ThreadHistoryMenu.vue` (WS-AUX-9, T-AUX-335).
 * ADR-009 — queries by `data-testid` only. SpDropdownPanel teleports its
 * children to `document.body` so we look up against the document, not the
 * mount wrapper.
 */
import type { VueWrapper } from '@vue/test-utils'

export class ThreadHistoryMenuPO {
	constructor(public readonly wrapper: VueWrapper) {}

	root(): HTMLElement | null {
		return document.querySelector<HTMLElement>('[data-testid="thread-history-menu"]')
	}

	empty(): HTMLElement | null {
		return document.querySelector<HTMLElement>('[data-testid="thread-history-empty"]')
	}

	list(): HTMLElement | null {
		return document.querySelector<HTMLElement>('[data-testid="thread-history-list"]')
	}

	rows(): HTMLElement[] {
		return Array.from(
			document.querySelectorAll<HTMLElement>('[data-testid^="thread-history-row-"]'),
		)
	}

	row(threadId: string): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-testid="thread-history-row-${threadId}"]`)
	}

	renameButton(): HTMLElement | null {
		return document.querySelector<HTMLElement>('[data-testid="thread-history-rename"]')
	}

	deleteButton(): HTMLElement | null {
		return document.querySelector<HTMLElement>('[data-testid="thread-history-delete"]')
	}

	renameInput(): HTMLInputElement | null {
		return document.querySelector<HTMLInputElement>(
			'[data-testid="thread-history-rename-input"]',
		)
	}
}
