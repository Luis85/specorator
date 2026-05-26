/**
 * The PURE, TOTAL stdio command tokeniser (P8, SPEC-MC-005). Ported verbatim from
 * claudian `utils/mcp.ts:46/59`. A no-shell, no-eval, quote-aware split — the same
 * posture as `ShellExecPort` (REQ-MC-061, NFR-MC-002). Never throws.
 */

/**
 * Split a stdio command into cmd + args (REQ-MC-020). When `providedArgs` is
 * non-empty, returns `{ cmd: command, args: providedArgs }`; else splits the command
 * string (quote-aware). `parseCommand('', undefined)` → `{ cmd:'', args:[] }` (the
 * empty-command case the tester turns into `error:'Missing command'`, EC-MC-7). Total.
 */
export function parseCommand(
	command: string,
	providedArgs?: string[],
): { cmd: string; args: string[] } {
	if (providedArgs !== undefined && providedArgs.length > 0) {
		return { cmd: command, args: providedArgs };
	}

	const parts = splitCommandString(command);
	if (parts.length === 0) {
		return { cmd: '', args: [] };
	}

	return { cmd: parts[0], args: parts.slice(1) };
}

interface SplitState {
	current: string;
	inQuote: boolean;
	quoteChar: string;
}

/** Fold one character into the tokeniser state, emitting a finished token via `push`. */
function stepCharacter(state: SplitState, char: string, push: (token: string) => void): void {
	if ((char === '"' || char === "'") && !state.inQuote) {
		state.inQuote = true;
		state.quoteChar = char;
		return;
	}
	if (char === state.quoteChar && state.inQuote) {
		state.inQuote = false;
		state.quoteChar = '';
		return;
	}
	if (/\s/.test(char) && !state.inQuote) {
		if (state.current !== '') {
			push(state.current);
			state.current = '';
		}
		return;
	}
	state.current += char;
}

/**
 * Quote-aware whitespace split (single/double quotes group a run, the quote chars
 * stripped) — the no-shell tokeniser. Splits on unquoted whitespace, invokes no
 * shell or eval. Total. Verbatim semantics of claudian `utils/mcp.ts:59`.
 */
export function splitCommandString(cmdStr: string): string[] {
	const parts: string[] = [];
	const state: SplitState = { current: '', inQuote: false, quoteChar: '' };

	for (const char of cmdStr) {
		stepCharacter(state, char, (token) => parts.push(token));
	}

	if (state.current !== '') {
		parts.push(state.current);
	}

	return parts;
}
