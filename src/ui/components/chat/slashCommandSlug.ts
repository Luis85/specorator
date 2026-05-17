/**
 * Sanitise a slash-command name into an id-safe slug. Vault-derived command
 * names (sourced from Markdown files under the user's `.claude` directory)
 * can contain spaces, dots, slashes, or other characters that break
 * getElementById-based aria-activedescendant resolution.
 *
 * Both ChatInput.vue (computes aria-activedescendant) and
 * SlashCommandDropdown.vue (renders the listbox option id) MUST use this
 * helper so the textarea pointer always lands on a valid option element.
 * Drift between the two would silently break screen-reader announcement of
 * highlighted slash options for any command whose name isn't already id-safe.
 *
 * data-testid attributes are intentionally NOT slugged — CSS attribute
 * selectors handle arbitrary UTF-8 fine.
 */
export function slashCommandSlug(name: string): string {
	return name.replace(/[^A-Za-z0-9_-]+/g, '_');
}
