/**
 * QW-B — Compose a `<vault-context>` block from the Obsidian workspace's
 * active-note path and the current editor selection.
 *
 * The block is prepended to the stage-aware `systemPromptSuffix` so the agent
 * (typically the Claude CLI subprocess) knows which note the user is looking
 * at, even though it cannot observe Obsidian's UI directly. Together with
 * QW-A (vault-root `cwd`), the subprocess can read the referenced file
 * without the user spelling out the path.
 *
 * Contract:
 *   - both `activePath` and `selection` `null` → empty string (no block).
 *   - any row whose source is `null` is omitted; the surrounding block stays.
 *   - the selection is fenced in a code block. The fence width auto-grows to
 *     four backticks when the selection itself contains a triple-backtick
 *     sequence so the user's code does not break out of the wrapper.
 *
 * Pure function — no I/O, no port dependencies. Unit-tested in isolation in
 * `tests/application/chat/composeVaultContextBlock.test.ts`.
 */
export function composeVaultContextBlock(
	activePath: string | null,
	selection: string | null,
): string {
	if (activePath === null && selection === null) return '';
	const lines: string[] = ['<vault-context>'];
	if (activePath !== null) {
		lines.push(`Active note: ${activePath}`);
	}
	if (selection !== null) {
		const fence = selection.includes('```') ? '````' : '```';
		lines.push('Selection:', fence, selection, fence);
	}
	lines.push('</vault-context>');
	return lines.join('\n');
}
