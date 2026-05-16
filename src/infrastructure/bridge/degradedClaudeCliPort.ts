import type {
	ClaudeCliPort,
	ClaudeCliQueryOptions,
	ClaudeCliStreamOptions,
	StreamDelta,
} from '@/domain/ports';
import { ClaudeCliError } from '@/domain/ports';
import { err, type Result } from '@/domain/shared/Result';

/**
 * Singleton `ClaudeCliPort` returned by `selectTransport` whenever the
 * transport row resolves to `'degraded'` (SPEC-ASM-001 §3.1 rows R1, R3, R5,
 * R8). The single sink for the degraded path — UI components branch on the
 * selector's `kind === 'degraded'`, but if any consumer accidentally invokes
 * the port, this stub fails fast with `CLI_LAUNCH_FAILED` rather than
 * crashing or making a network call.
 *
 * Satisfies REQ-ASM-002, REQ-ASM-009.
 *
 * Frozen with `Object.freeze` so it can be safely shared and so accidental
 * mutation in test harnesses surfaces immediately.
 */

function makeError(): ClaudeCliError {
	return new ClaudeCliError('CLI_LAUNCH_FAILED', 'Chat needs the Claude command-line tool.');
}

export const degradedClaudeCliPort: ClaudeCliPort = Object.freeze({
	query(
		_prompt: string,
		_options?: ClaudeCliQueryOptions,
	): Promise<Result<string, ClaudeCliError>> {
		return Promise.resolve(err(makeError()));
	},

	isAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	},

	startup(): Promise<void> {
		return Promise.resolve();
	},

	shutdown(): void {
		/* no-op */
	},

	// eslint-disable-next-line @typescript-eslint/require-await
	async *queryStream(
		_prompt: string,
		_options?: ClaudeCliStreamOptions,
	): AsyncIterable<StreamDelta> {
		yield { type: 'error', error: makeError() };
	},
});
