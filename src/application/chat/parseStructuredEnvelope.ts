/**
 * T-ASM-035 — Structured-output parser for the agent side-panel chat.
 *
 * Implements the four-step pipeline from SPEC-ASM-001 §3.3 / §6.3 and
 * ADR-0030 (structured JSON output via JSON Schema):
 *
 *   1. Prefer `raw.structured_output` when present (and not `null`). The
 *      adapter populates this from `claude -p --output-format json
 *      --json-schema '<schema>'`. Validate with the canonical Zod schema and,
 *      on success, return the parsed envelope.
 *   2. Fall back to a brace-depth scan over `raw.result` to extract the first
 *      balanced `{…}` block. The scanner tracks string state and escape state
 *      so braces inside string literals are opaque.
 *   3. `JSON.parse` the extracted substring.
 *   4. Validate the parsed object with the same Zod schema.
 *
 * Every failure path returns an {@link EnvelopeParseError} via `Result.error`;
 * the `kind` discriminator records which stage rejected the response and is
 * used for logging and tests only (REQ-ASM-025 collapses all kinds to a
 * single user-facing string).
 *
 * Pure and synchronous — no I/O, no `obsidian` imports.
 *
 * Satisfies REQ-ASM-023, REQ-ASM-024, REQ-ASM-025.
 */
import { ok, err, type Result } from '@/domain/shared/Result'
import { trySync } from '@/domain/shared/tryAsync'

import {
  createFileEnvelopeSchema,
  type CreateFileEnvelope,
} from './createFileEnvelopeSchema'
import { EnvelopeParseError } from './errors'

/**
 * Shape of the raw Claude CLI structured response. Both fields are optional
 * here so the parser can defend against truncated or unexpected adapter
 * output; the spec's `StructuredCliRawResult` interface requires both, but
 * the parser must still produce a typed error rather than crash on missing
 * fields.
 */
export interface StructuredEnvelopeInput {
  readonly result?: string
  readonly structured_output?: unknown
}

/**
 * Extract the first balanced `{…}` JSON object from arbitrary text.
 *
 * Walks the input character-by-character, tracking:
 *   - brace depth (only outside string literals);
 *   - whether we are currently inside a `"…"` string literal;
 *   - whether the previous character was an unescaped backslash (so escaped
 *     quotes inside strings do not end the string early).
 *
 * Returns the substring from the first `{` to its matching `}` (inclusive),
 * or `null` if no balanced object is found. Regex would not suffice — JSON's
 * grammar is not regular once string content can contain braces.
 *
 * Exported for direct unit testing per SPEC §3.3.
 */
interface ScannerState {
  readonly inString: boolean
  readonly escapeNext: boolean
}

/**
 * Advance the string/escape state machine by one character while inside a
 * `"…"` string literal. Returns the next state. Extracted to keep the main
 * scanner's cyclomatic complexity under the lint threshold.
 */
function advanceInString(ch: string, escapeNext: boolean): ScannerState {
  if (escapeNext) return { inString: true, escapeNext: false }
  if (ch === '\\') return { inString: true, escapeNext: true }
  if (ch === '"') return { inString: false, escapeNext: false }
  return { inString: true, escapeNext: false }
}

export function extractFirstBalancedObject(input: string): string | null {
  const start = input.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let state: ScannerState = { inString: false, escapeNext: false }

  for (let i = start; i < input.length; i++) {
    const ch = input[i]

    if (state.inString) {
      state = advanceInString(ch, state.escapeNext)
      continue
    }

    if (ch === '"') {
      state = { inString: true, escapeNext: false }
      continue
    }
    if (ch === '{') {
      depth++
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) return input.slice(start, i + 1)
      // Unbalanced — more `}` than `{`. Spec only addresses the inverse
      // case; treat as unbalanced (return null) for safety.
      if (depth < 0) return null
    }
  }

  // Reached end of input with depth still > 0 → unbalanced.
  return null
}

/**
 * Parse a structured `createFile` envelope from a raw Claude CLI response.
 * See module header for the four-step pipeline.
 */
export function parseStructuredEnvelope(
  raw: StructuredEnvelopeInput,
): Result<CreateFileEnvelope, EnvelopeParseError> {
  // Step 1: prefer `.structured_output` when present.
  if (raw.structured_output !== undefined && raw.structured_output !== null) {
    const primary = createFileEnvelopeSchema.safeParse(raw.structured_output)
    if (primary.success) {
      return ok(primary.data)
    }
    return err(
      new EnvelopeParseError(
        'PRIMARY_ZOD_FAILED',
        'structured_output failed Zod validation.',
        primary.error,
      ),
    )
  }

  // Step 2: fall back to brace-depth scan of `.result`.
  if (raw.result === undefined) {
    return err(
      new EnvelopeParseError(
        'STRUCTURED_OUTPUT_MISSING',
        'Response contained neither structured_output nor result.',
      ),
    )
  }

  const extracted = extractFirstBalancedObject(raw.result)
  if (extracted === null) {
    return err(
      new EnvelopeParseError(
        'FALLBACK_EXTRACTION_FAILED',
        'No balanced JSON object found in result.',
      ),
    )
  }

  // Step 3: JSON.parse the extracted substring (via trySync — raw try/catch
  // is forbidden in application/ per ESLint).
  const parsed = trySync(() => JSON.parse(extracted) as unknown)
  if (!parsed.ok) {
    return err(
      new EnvelopeParseError(
        'FALLBACK_JSON_PARSE_FAILED',
        'Extracted block was not valid JSON.',
        parsed.error,
      ),
    )
  }

  // Step 4: Zod-validate the parsed object.
  const validated = createFileEnvelopeSchema.safeParse(parsed.value)
  if (!validated.success) {
    return err(
      new EnvelopeParseError(
        'FALLBACK_ZOD_FAILED',
        'Fallback-parsed JSON failed Zod validation.',
        validated.error,
      ),
    )
  }

  return ok(validated.data)
}
