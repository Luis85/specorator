/**
 * Narrow port that renders a yes/no confirmation modal so trust-first
 * file-write commits (REQ-ASM-044, ADR-0032) are testable without Obsidian.
 *
 * Implementations live in `src/infrastructure/`:
 * - `ObsidianConfirmModal` wraps an Obsidian `Modal` subclass (production).
 * - `MockConfirmModalPort` / `FakeConfirmModal` are field-driven test doubles.
 *
 * Domain layer — must not import `obsidian`.
 */
export interface ConfirmModalRequest {
	readonly title: string
	readonly body: string
	readonly confirmLabel: string
	readonly cancelLabel: string
}

export interface ConfirmModalPort {
	/**
	 * Renders a modal yes/no prompt; resolves to true on confirm, false on cancel
	 * or Escape. Never throws.
	 */
	show(args: ConfirmModalRequest): Promise<boolean>
}
