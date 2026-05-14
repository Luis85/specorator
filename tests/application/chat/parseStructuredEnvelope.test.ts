/**
 * T-ASM-034 — Tests for `extractFirstBalancedObject` and
 * `parseStructuredEnvelope` (SPEC §3.3 / §6.3, ADR-0030).
 *
 * Covers:
 * - TEST-ASM-027 (REQ-ASM-023): `.structured_output` with extra unknown field
 *   → `PRIMARY_ZOD_FAILED`.
 * - TEST-ASM-028 (REQ-ASM-024): `.structured_output` missing, prose-wrapped
 *   envelope with nested braces inside `content` → balanced scan succeeds.
 * - All five `EnvelopeParseFailureKind` discriminator values:
 *   `STRUCTURED_OUTPUT_MISSING`, `PRIMARY_ZOD_FAILED`,
 *   `FALLBACK_EXTRACTION_FAILED`, `FALLBACK_JSON_PARSE_FAILED`,
 *   `FALLBACK_ZOD_FAILED`.
 * - REQ-ASM-025: error envelope shape (errorCode + kind + cause).
 */
import { describe, it, expect } from 'vitest'

import {
  extractFirstBalancedObject,
  parseStructuredEnvelope,
} from '@/application/chat/parseStructuredEnvelope'
import { EnvelopeParseError } from '@/application/chat/errors'

describe('extractFirstBalancedObject', () => {
  it('returns a plain JSON object verbatim', () => {
    const text = '{"action":"createFile","path":"a.md","content":"hi"}'
    expect(extractFirstBalancedObject(text)).toBe(text)
  })

  it('extracts a JSON object embedded in prose', () => {
    const envelope = '{"action":"createFile","path":"a.md","content":"hi"}'
    const text = `Sure, here you go: ${envelope} — that should do it.`
    expect(extractFirstBalancedObject(text)).toBe(envelope)
  })

  it('extracts a JSON object wrapped in a fenced code block', () => {
    const envelope = '{"action":"createFile","path":"a.md","content":"hi"}'
    const text = '```json\n' + envelope + '\n```'
    // The scanner finds the first `{` (inside the fence) and walks to its
    // balancing `}`. Result is the inner envelope, ignoring the fences.
    expect(extractFirstBalancedObject(text)).toBe(envelope)
  })

  it('treats braces inside string literals as opaque (nested-brace content)', () => {
    // Embeds raw braces inside the `content` string field. The scanner must
    // NOT decrement depth on them — otherwise it would return prematurely
    // at the first `}` inside `content`.
    const envelope =
      '{"action":"createFile","path":"a.md","content":"function f() { return { x: 1 } }"}'
    expect(extractFirstBalancedObject(envelope)).toBe(envelope)
  })

  it('handles escaped quotes inside string literals', () => {
    const envelope = '{"action":"createFile","path":"a.md","content":"\\"hi\\""}'
    expect(extractFirstBalancedObject(envelope)).toBe(envelope)
  })

  it('returns null when no `{` is present', () => {
    expect(extractFirstBalancedObject('no braces at all here')).toBeNull()
  })

  it('returns null when braces are unbalanced (more `{` than `}`)', () => {
    expect(extractFirstBalancedObject('prelude {"path":"a.md","content":"x"')).toBeNull()
  })

  it('returns null on an empty string', () => {
    expect(extractFirstBalancedObject('')).toBeNull()
  })
})

describe('parseStructuredEnvelope', () => {
  const validEnvelope = {
    action: 'createFile' as const,
    path: 'specs/foo/idea.md',
    content: 'Hello world',
  }

  it('returns ok(envelope) when `structured_output` is present and valid', () => {
    const result = parseStructuredEnvelope({
      result: 'ignored when structured_output is present',
      structured_output: validEnvelope,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(validEnvelope)
    }
  })

  it('falls back to `.result` brace-depth scan when `structured_output` is missing', () => {
    const result = parseStructuredEnvelope({
      result: `Sure thing: ${JSON.stringify(validEnvelope)} done.`,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(validEnvelope)
    }
  })

  it('returns PRIMARY_ZOD_FAILED when `structured_output` has an extra unknown field', () => {
    // TEST-ASM-027 — `.strict()` rejects extra fields.
    const result = parseStructuredEnvelope({
      result: 'irrelevant',
      structured_output: { ...validEnvelope, foo: 'extra' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(EnvelopeParseError)
      expect(result.error.kind).toBe('PRIMARY_ZOD_FAILED')
      expect(result.error.errorCode).toBe('STRUCTURED_PARSE_FAILED')
      expect(result.error.cause).toBeDefined()
    }
  })

  it('returns PRIMARY_ZOD_FAILED when `structured_output` shape is wrong', () => {
    const result = parseStructuredEnvelope({
      result: 'irrelevant',
      structured_output: { action: 'deleteFile', path: 'a.md', content: 'x' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('PRIMARY_ZOD_FAILED')
    }
  })

  it('extracts a prose-wrapped envelope with nested braces inside content', () => {
    // TEST-ASM-028 — envelope embedded in prose, content has `{` and `}`.
    const envelope = {
      action: 'createFile' as const,
      path: 'src/foo.ts',
      content: 'function f() { return { x: 1 } }',
    }
    const result = parseStructuredEnvelope({
      result: `Some preamble: ${JSON.stringify(envelope)} trailing.`,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(envelope)
    }
  })

  it('returns FALLBACK_EXTRACTION_FAILED when `.result` has no JSON object', () => {
    const result = parseStructuredEnvelope({
      result: 'I cannot do that, Dave.',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('FALLBACK_EXTRACTION_FAILED')
      expect(result.error.errorCode).toBe('STRUCTURED_PARSE_FAILED')
    }
  })

  it('returns FALLBACK_EXTRACTION_FAILED when `.result` has unbalanced braces', () => {
    const result = parseStructuredEnvelope({
      result: 'prelude {"path":"a.md","content":"x"',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('FALLBACK_EXTRACTION_FAILED')
    }
  })

  it('returns FALLBACK_JSON_PARSE_FAILED when extracted block is malformed JSON', () => {
    // Trailing comma inside an object — extractable as a balanced `{…}` block
    // (braces balance, no unescaped quotes mid-string) but rejected by
    // JSON.parse.
    const result = parseStructuredEnvelope({
      result: '{"action":"createFile","path":"a.md","content":"x",}',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('FALLBACK_JSON_PARSE_FAILED')
      expect(result.error.cause).toBeInstanceOf(Error)
    }
  })

  it('returns FALLBACK_ZOD_FAILED when extracted JSON parses but fails the schema', () => {
    const result = parseStructuredEnvelope({
      result: '{"action":"deleteFile","path":"a.md","content":"x"}',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('FALLBACK_ZOD_FAILED')
      expect(result.error.cause).toBeDefined()
    }
  })

  it('returns STRUCTURED_OUTPUT_MISSING when both `structured_output` and `.result` are missing', () => {
    const result = parseStructuredEnvelope({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('STRUCTURED_OUTPUT_MISSING')
      expect(result.error.errorCode).toBe('STRUCTURED_PARSE_FAILED')
    }
  })

  it('treats `structured_output: null` as missing and falls back to `.result`', () => {
    // ADR-0030 step 1 guards on `!== undefined && !== null`.
    const result = parseStructuredEnvelope({
      result: JSON.stringify(validEnvelope),
      structured_output: null,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(validEnvelope)
    }
  })
})
