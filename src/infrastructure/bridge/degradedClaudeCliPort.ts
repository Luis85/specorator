import type {
	ChatTransportPort,
	ChatTransportStreamOptions,
	StreamDelta,
} from '@/domain/ports';
import { ChatTransportError } from '@/domain/ports';

/**
 * Singleton `ChatTransportPort` returned by `selectTransport` whenever the
 * transport row resolves to `'degraded'` (SPEC-ASM-001 §3.1 rows R1, R3, R5,
 * R8). The single sink for the degraded path — UI components branch on the
 * selector's `kind === 'degraded'`, but if any consumer accidentally invokes
 * the port, this stub fails fast with `CLI_LAUNCH_FAILED` rather than
 * crashing or making a network call.
 *
 * WP-12: surface narrowed to the new `ChatTransportPort` shape (`isAvailable` +
 * `queryStream`; no `query`, no lifecycle methods). The degraded port
 * intentionally does not expose `runStructured` — its absence is what
 * `queryStructured()` keys off when the transport is degraded.
 *
 * Satisfies REQ-ASM-002, REQ-ASM-009.
 *
 * Frozen with `Object.freeze` so it can be safely shared and so accidental
 * mutation in test harnesses surfaces immediately.
 */

function makeError(): ChatTransportError {
	return new ChatTransportError('CLI_LAUNCH_FAILED', 'Chat needs the Claude command-line tool.');
}

export const degradedClaudeCliPort: ChatTransportPort = Object.freeze({
	isAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	},

	// eslint-disable-next-line @typescript-eslint/require-await
	async *queryStream(
		_prompt: string,
		_options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		yield { type: 'error', error: makeError() };
	},
});
