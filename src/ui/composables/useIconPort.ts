import { inject } from 'vue'
import type { IconPort } from '@/domain/ports'
import { ICON_PORT } from '@/infrastructure/bridge/ports'

/**
 * Resolves the IconPort provided by the host (Obsidian view, standalone app,
 * or LocalStorage demo). Used exclusively by `<SpIcon>` — every other UI
 * surface renders icons by composing that primitive.
 *
 * REQ-AUX-001, ADR-AUX-001.
 */
export function useIconPort(): IconPort {
	const port = inject(ICON_PORT)
	if (!port) {
		throw new Error(
			'IconPort was not provided. Call app.provide(ICON_PORT, port) before mounting the app.',
		)
	}
	return port
}
