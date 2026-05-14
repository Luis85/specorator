/**
 * T-ASM-032 — Tests for the createFile envelope Zod schema and its derived
 * JSON-Schema string. Covers DoD scenarios: valid envelope passes,
 * missing/wrong action literal fails, missing/empty path fails,
 * missing content fails, empty content passes, extra fields rejected
 * via .strict(), and the JSON-Schema string is parseable + contains
 * the expected `required` keys.
 */
import { describe, it, expect } from 'vitest'

import {
  createFileEnvelopeSchema,
  createFileEnvelopeJsonSchema,
} from '@/application/chat/createFileEnvelopeSchema'

describe('createFileEnvelopeSchema', () => {
  it('accepts a valid envelope', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      path: 'specs/foo/idea.md',
      content: 'Hello',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('createFile')
      expect(result.data.path).toBe('specs/foo/idea.md')
      expect(result.data.content).toBe('Hello')
    }
  })

  it('rejects missing action', () => {
    const result = createFileEnvelopeSchema.safeParse({
      path: 'a.md',
      content: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects wrong action literal (lowercase)', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createfile',
      path: 'a.md',
      content: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects wrong action literal (kebab-case)', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'create-file',
      path: 'a.md',
      content: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing path', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      content: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty string path (.min(1))', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      path: '',
      content: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-string path', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      path: 123,
      content: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing content', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      path: 'a.md',
    })
    expect(result.success).toBe(false)
  })

  it('accepts empty content (empty file is legal)', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      path: 'a.md',
      content: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects extra fields via .strict()', () => {
    const result = createFileEnvelopeSchema.safeParse({
      action: 'createFile',
      path: 'a.md',
      content: 'x',
      maliciousExtra: 'ignore-me-please',
    })
    expect(result.success).toBe(false)
  })
})

describe('createFileEnvelopeJsonSchema', () => {
  it('is a valid JSON-parseable string', () => {
    expect(typeof createFileEnvelopeJsonSchema).toBe('string')
    expect(() => JSON.parse(createFileEnvelopeJsonSchema)).not.toThrow()
  })

  it('declares all three fields as required', () => {
    const parsed = JSON.parse(createFileEnvelopeJsonSchema) as {
      required?: readonly string[]
    }
    expect(parsed.required).toBeDefined()
    const required = parsed.required ?? []
    expect(required).toContain('action')
    expect(required).toContain('path')
    expect(required).toContain('content')
  })
})
