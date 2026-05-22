/**
 * Render a Lucide icon into an HTMLElement (REQ-AUX-001, ADR-AUX-001).
 *
 * Production implementation (ObsidianBridge) delegates to `obsidian.setIcon`.
 * Test / standalone implementations (MockBridge, LocalStorageBridge) write
 * an SVG placeholder of the form `<svg data-icon="{name}"><title>{name}</title></svg>`
 * so consumers can assert on the icon name without booting Obsidian.
 *
 * Pre-conditions:
 *   - `el` is a mounted HTMLElement (in the DOM).
 *   - `name` is a non-empty string matching a Lucide icon id.
 *
 * Post-conditions:
 *   - If `name` resolves: `el` contains an `<svg>` child.
 *   - If `name` does not resolve: `el` contents are unchanged (the UI layer's
 *     `<SpIcon>` handles the text fallback).
 *   - The function is synchronous and idempotent — calling it twice with the
 *     same `(el, name)` produces the same DOM state.
 *
 * Errors: must not throw; missing-icon must leave `el` untouched.
 */
export interface IconPort {
	setIcon(el: HTMLElement, name: string): void
}
