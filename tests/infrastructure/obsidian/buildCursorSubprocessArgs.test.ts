/**
 * T-MPS-059 — Tests for `buildCursorSubprocessArgs`.
 *
 * Pure argv assembler for the Cursor CLI subprocess. Mirror of
 * `buildSubprocessArgs` for Claude. Reference shape (SPEC-MPS-001 §6,
 * placeholder pending CQ-MPS-01):
 *
 *   ['chat', '--stream-json', '--prompt', prompt,
 *    ...(options.model ? ['--model', options.model] : []),
 *    ...(options.planMode ? ['--mode', 'plan'] : []),
 *    ...(options.resumeSessionId ? ['--resume', options.resumeSessionId] : [])]
 *
 * Satisfies: REQ-MPS-015, REQ-MPS-037.
 */
import { describe, it, expect } from 'vitest'

import {
  buildCursorSubprocessArgs,
  type BuildCursorSubprocessArgsInput,
} from '@/infrastructure/obsidian/buildCursorSubprocessArgs'

function makeInput(
  overrides: Partial<BuildCursorSubprocessArgsInput> = {},
): BuildCursorSubprocessArgsInput {
  return {
    prompt: 'hello cursor',
    model: null,
    planMode: false,
    resumeSessionId: null,
    ...overrides,
  }
}

describe('buildCursorSubprocessArgs — base shape', () => {
  it('emits chat + stream-json + prompt by default', () => {
    const argv = buildCursorSubprocessArgs(makeInput())

    expect(Array.from(argv)).toEqual(['chat', '--stream-json', '--prompt', 'hello cursor'])
  })

  it('returns a frozen array (callers cannot mutate)', () => {
    const argv = buildCursorSubprocessArgs(makeInput())
    expect(Object.isFrozen(argv)).toBe(true)
  })
})

describe('buildCursorSubprocessArgs — optional flags (REQ-MPS-037)', () => {
  it('appends --model when model is a non-empty string', () => {
    const argv = buildCursorSubprocessArgs(makeInput({ model: 'cursor-default' }))
    expect(Array.from(argv)).toEqual([
      'chat',
      '--stream-json',
      '--prompt',
      'hello cursor',
      '--model',
      'cursor-default',
    ])
  })

  it('omits --model when model is null', () => {
    const argv = buildCursorSubprocessArgs(makeInput({ model: null }))
    expect(Array.from(argv)).not.toContain('--model')
  })

  it('omits --model when model is the empty string', () => {
    const argv = buildCursorSubprocessArgs(makeInput({ model: '' }))
    expect(Array.from(argv)).not.toContain('--model')
  })

  it('appends `--mode plan` when planMode is true', () => {
    const argv = buildCursorSubprocessArgs(makeInput({ planMode: true }))
    expect(Array.from(argv)).toEqual([
      'chat',
      '--stream-json',
      '--prompt',
      'hello cursor',
      '--mode',
      'plan',
    ])
  })

  it('appends --resume when resumeSessionId is a non-empty string', () => {
    const argv = buildCursorSubprocessArgs(makeInput({ resumeSessionId: 'sess-123' }))
    expect(Array.from(argv)).toEqual([
      'chat',
      '--stream-json',
      '--prompt',
      'hello cursor',
      '--resume',
      'sess-123',
    ])
  })

  it('omits --resume when resumeSessionId is the empty string', () => {
    const argv = buildCursorSubprocessArgs(makeInput({ resumeSessionId: '' }))
    expect(Array.from(argv)).not.toContain('--resume')
  })

  it('combines all optional flags in declared order: model, plan, resume', () => {
    const argv = buildCursorSubprocessArgs(
      makeInput({
        model: 'cursor-default',
        planMode: true,
        resumeSessionId: 'sess-9',
      }),
    )
    expect(Array.from(argv)).toEqual([
      'chat',
      '--stream-json',
      '--prompt',
      'hello cursor',
      '--model',
      'cursor-default',
      '--mode',
      'plan',
      '--resume',
      'sess-9',
    ])
  })
})
