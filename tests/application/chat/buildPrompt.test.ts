/**
 * T-CCS-006 — Tests for buildPrompt() function.
 * Satisfies REQ-CCS-005, REQ-CCS-012, REQ-CCS-023, SPEC-CCS-001 §3.
 * Maps to: TEST-CCS-BP-001, TEST-CCS-BP-002.
 */
import { describe, it, expect } from 'vitest'
import { buildPrompt } from '@/application/chat/buildPrompt'
import type { ContextFile } from '@/application/chat/buildPrompt'

const DEFAULT_CHAR_BUDGET = 50_000 * 4 // 200 000 chars

function makeFile(path: string, content: string, isAuto = false): ContextFile {
  return { path, label: path.split('/').pop() ?? path, isAuto, content }
}

describe('REQ-CCS-005, REQ-CCS-012: buildPrompt()', () => {
  // TEST-CCS-BP-001: no context files
  it('returns userText verbatim when contextFiles is empty', () => {
    const result = buildPrompt('Hello', [], undefined)
    expect(result.prompt).toBe('Hello')
    expect(result.truncated).toBe(false)
  })

  it('returns userText verbatim when contextFiles is an empty array with options', () => {
    const result = buildPrompt('Hi', [], { tokenCap: 1000 })
    expect(result.prompt).toBe('Hi')
    expect(result.truncated).toBe(false)
  })

  // Format per SPEC-CCS-001 §3.3
  it('assembles prompt with preamble, file section, trailing separator, and userText', () => {
    const file = makeFile('specs/foo/req.md', '# Requirements\nFoo', false)
    const { prompt } = buildPrompt('What next?', [file])
    expect(prompt).toContain('The following files are provided for context:')
    expect(prompt).toContain('---\nFile: specs/foo/req.md\n---\n# Requirements\nFoo')
    expect(prompt).toContain('---\n\nWhat next?')
    expect(prompt.endsWith('What next?')).toBe(true)
  })

  it('includes file path and content per spec §3.3 — TEST-CCS-005 partial', () => {
    const file = makeFile('specs/foo/req.md', '# Requirements\nFoo', true)
    const { prompt } = buildPrompt('What next?', [file])
    expect(prompt).toContain('File: specs/foo/req.md')
    expect(prompt).toContain('# Requirements\nFoo')
  })

  it('returns truncated=false when total length is within budget', () => {
    const file = makeFile('a.md', 'short content')
    const result = buildPrompt('hello', [file])
    expect(result.truncated).toBe(false)
  })

  // Within budget, no truncation
  it('assembles multiple files in order without truncation', () => {
    const f1 = makeFile('a.md', 'content-a')
    const f2 = makeFile('b.md', 'content-b')
    const { prompt, truncated } = buildPrompt('msg', [f1, f2])
    expect(truncated).toBe(false)
    const aIdx = prompt.indexOf('File: a.md')
    const bIdx = prompt.indexOf('File: b.md')
    expect(aIdx).toBeGreaterThan(-1)
    expect(bIdx).toBeGreaterThan(-1)
    expect(aIdx).toBeLessThan(bIdx)
  })

  // LIFO drop: manual files dropped from the end first — TEST-CCS-BP-002
  it('drops last manual file LIFO when over budget', () => {
    // auto file: 500 chars, manual-A: 100 000 chars, manual-B: 100 001 chars
    // combined > 200 000 char budget → B (last) dropped first
    const autoFile = makeFile('auto.md', 'A'.repeat(500), true)
    const manualA = makeFile('manual-a.md', 'B'.repeat(100_000), false)
    const manualB = makeFile('manual-b.md', 'C'.repeat(100_001), false)
    const { prompt, truncated } = buildPrompt('user', [autoFile, manualA, manualB])
    expect(truncated).toBe(true)
    expect(prompt).not.toContain('File: manual-b.md')
    expect(prompt.length).toBeLessThanOrEqual(DEFAULT_CHAR_BUDGET)
  })

  it('drops both manual files when combined they exceed budget and each alone also exceeds it', () => {
    // Use tokenCap=100 (400 chars) so content is easy to reason about.
    // auto: 50 chars, manualA: 350 chars, manualB: 350 chars — total >> 400 char budget
    // After dropping manualB: auto(50) + manualA(350) + overhead > 400 → manualA also dropped
    const smallCap = 100 // 400 chars
    const autoFile = makeFile('auto.md', 'X'.repeat(50), true)
    const manualA = makeFile('manual-a.md', 'A'.repeat(350), false)
    const manualB = makeFile('manual-b.md', 'B'.repeat(350), false)
    const charBudget = smallCap * 4
    const { prompt, truncated } = buildPrompt('q', [autoFile, manualA, manualB], { tokenCap: smallCap })
    expect(truncated).toBe(true)
    // Both manual files dropped, auto survives (trimmed if needed)
    expect(prompt).toContain('File: auto.md')
    expect(prompt).not.toContain('File: manual-a.md')
    expect(prompt).not.toContain('File: manual-b.md')
    expect(prompt.length).toBeLessThanOrEqual(charBudget)
  })

  // Auto file trimmed from end when still over budget after all manual files dropped
  it('trims auto file content from the end when still over budget', () => {
    // With auto file at 190 000 chars and user text 15 000 chars → > 200 000 budget
    const autoFile = makeFile('auto.md', 'A'.repeat(190_000), true)
    const { prompt, truncated } = buildPrompt('U'.repeat(15_000), [autoFile])
    expect(truncated).toBe(true)
    expect(prompt.length).toBeLessThanOrEqual(DEFAULT_CHAR_BUDGET)
    // Auto file content is present but trimmed
    expect(prompt).toContain('File: auto.md')
  })

  // MIN_ACTIVE_FILE_CHARS = 500: auto file content never drops below 500 chars
  it('auto file content never drops below MIN_ACTIVE_FILE_CHARS (500 chars)', () => {
    // Fill budget with auto file; user text pushes far over budget
    const autoFile = makeFile('auto.md', 'Z'.repeat(1_000), true)
    // User text large enough to push even 500-char auto file over
    const { prompt } = buildPrompt('U'.repeat(DEFAULT_CHAR_BUDGET), [autoFile])
    // Extract the file content from the assembled prompt
    const fileStart = prompt.indexOf('---\nFile: auto.md\n---\n') + '---\nFile: auto.md\n---\n'.length
    const fileEnd = prompt.indexOf('\n\n---\n\n', fileStart)
    if (fileEnd !== -1) {
      const fileContent = prompt.slice(fileStart, fileEnd)
      // Content should be at least MIN_ACTIVE_FILE_CHARS or original length, whichever smaller
      expect(fileContent.length).toBeGreaterThanOrEqual(Math.min(500, 1_000))
    }
    // The overall prompt may be hard-truncated
    expect(prompt.length).toBeLessThanOrEqual(DEFAULT_CHAR_BUDGET)
  })

  // Hard-truncation: when userText alone exceeds budget
  it('hard-truncates to charBudget when userText alone exceeds budget', () => {
    const { prompt, truncated } = buildPrompt('X'.repeat(DEFAULT_CHAR_BUDGET + 1_000), [])
    expect(truncated).toBe(true)
    expect(prompt.length).toBeLessThanOrEqual(DEFAULT_CHAR_BUDGET)
  })

  // No prohibited terms — REQ-CCS-023 (partial for buildPrompt output)
  it('assembled prompt contains no prohibited terms', () => {
    const file = makeFile('a.md', 'Some content about the project.', false)
    const { prompt } = buildPrompt('What should I do?', [file])
    const prohibited = ['system prompt', 'API', 'SDK', 'tokens']
    for (const term of prohibited) {
      expect(prompt.toLowerCase()).not.toContain(term.toLowerCase())
    }
  })

  it('respects custom tokenCap option', () => {
    const smallCap = 100 // 100 tokens = 400 chars
    const file = makeFile('f.md', 'A'.repeat(500), false)
    const { truncated, prompt } = buildPrompt('hi', [file], { tokenCap: smallCap })
    expect(truncated).toBe(true)
    expect(prompt.length).toBeLessThanOrEqual(smallCap * 4)
  })
})
