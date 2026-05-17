/**
 * T-ASM-039 — `queryStructured`: application-layer wrapper around the
 * structured-output path on the subscription transport.
 *
 * Spec reference: SPEC-ASM-001 §2.9 (type seam) and §6.6 (module shape and
 * algorithm).
 *
 * Reshaped in WP-12 (Arch review #3):
 *   - `runStructured` is now an *optional* method on `ClaudeCliPort` itself.
 *     Subscription-capable adapters implement it; the SDK adapter and the
 *     `degradedClaudeCliPort` sentinel do not.
 *   - The `SubscriptionCapable` structural sidecar interface and the
 *     `isSubscriptionCapable` type guard are deleted (no back-compat shim
 *     per AGENTS.md §8).
 *   - The narrowing site is now a plain
 *     `typeof port.runStructured === 'function'` check, with no `kind`
 *     discriminator to keep in sync.
 *
 * Algorithm (§6.6):
 *   1. If `port.runStructured` is not a function → return
 *      `err(ClaudeCliError{ NOT_INSTALLED })` — structured output requires
 *      the subscription transport.
 *   2. `raw = await port.runStructured(prompt, options)`.
 *   3. If `!raw.ok` → propagate the adapter's `ClaudeCliError`.
 *   4. Return `parseStructuredEnvelope(raw.value)`.
 *
 * Satisfies REQ-ASM-001, REQ-ASM-021, REQ-ASM-049.
 */
import {
	ClaudeCliError,
	type ClaudeCliPort,
	type ClaudeCliQueryOptions,
	type StructuredCliCallOptions,
	type StructuredCliRawResult,
} from '@/domain/ports/ClaudeCliPort'
import { err, type Result } from '@/domain/shared/Result'

import type { CreateFileEnvelope } from './createFileEnvelopeSchema'
import type { EnvelopeParseError } from './errors'
import { parseStructuredEnvelope } from './parseStructuredEnvelope'

/**
 * Structured-output guard phrase appended to every structured call's system
 * prompt suffix. The `--output-format json --json-schema` flags constrain the
 * shape, but in practice models will sometimes emit prose or code fences
 * around the JSON object — that prose then trips `parseStructuredEnvelope`
 * and surfaces as `EnvelopeParseError`/`structured-fail` even when the
 * user's command was valid. Pinning the contract in the system prompt makes
 * the model far more likely to return an object-only response (Codex P2,
 * PR #347).
 *
 * Centralised here so every caller of `queryStructured` inherits the guard
 * without having to remember to append it themselves.
 */
export const STRUCTURED_OUTPUT_GUARD_SUFFIX =
	'\n\nRespond with a single JSON object that conforms to the provided schema. ' +
	'Do not include any prose, explanation, code fences, or markdown formatting ' +
	'before or after the JSON object.'

/**
 * Narrowing helper: returns `true` iff the port exposes a callable
 * `runStructured` method. Replaces the deleted `isSubscriptionCapable`
 * type guard (WP-12) — there is no `kind` discriminator any more, and
 * sub-capability detection is one method-presence check.
 */
function hasRunStructured(
	port: ClaudeCliPort,
): port is ClaudeCliPort & {
	runStructured: NonNullable<ClaudeCliPort['runStructured']>
} {
	return typeof port.runStructured === 'function'
}

/**
 * Application-layer wrapper around the structured-output path. See module
 * header and SPEC §6.6 for the algorithm. Never throws. The error union
 * surfaces:
 *   - `ClaudeCliError{ NOT_INSTALLED }` when the port does not expose
 *     `runStructured`.
 *   - `ClaudeCliError{ … }` propagated from the adapter (TIMEOUT, QUERY_FAILED, etc.).
 *   - `EnvelopeParseError` from the four-step `parseStructuredEnvelope` pipeline.
 */
export async function queryStructured(
	port: ClaudeCliPort,
	prompt: string,
	options: StructuredCliCallOptions = {},
): Promise<Result<CreateFileEnvelope, EnvelopeParseError | ClaudeCliError>> {
	if (!hasRunStructured(port)) {
		return err(
			new ClaudeCliError(
				'NOT_INSTALLED',
				'Structured output requires the subscription transport.',
			),
		)
	}

	// Always pin the JSON-only guard on the system prompt suffix so the model
	// returns an object-only response (Codex P2, PR #347). The stage preamble
	// composed by `assembleSystemPrompt` (when present) precedes the guard.
	const callerSuffix = options.systemPromptSuffix ?? ''
	const mergedOptions: StructuredCliCallOptions = {
		...options,
		systemPromptSuffix: callerSuffix + STRUCTURED_OUTPUT_GUARD_SUFFIX,
	}

	const raw = await port.runStructured(prompt, mergedOptions)
	if (!raw.ok) {
		return err(raw.error)
	}

	return parseStructuredEnvelope(raw.value)
}

// Re-export the standard option types so call sites that already hold a
// free-text options bag can pass it straight through without an extra import
// line. The structured options are a subset.
export type { ClaudeCliQueryOptions, StructuredCliCallOptions, StructuredCliRawResult }
