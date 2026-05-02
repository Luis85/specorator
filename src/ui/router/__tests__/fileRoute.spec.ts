import { describe, expect, it } from 'vitest'
import { router } from '../index'

describe('file route encoding', () => {
  it('round-trips a raw path with spaces, unicode, and slash separators', () => {
    const filePath = 'specs/Über cool feature/test plan.md'

    const resolved = router.resolve({ name: 'file', params: { filePath } })
    const matched = router.resolve(resolved.fullPath)

    expect(resolved.href).toContain('%C3%9Cber%20cool%20feature')
    expect(resolved.href).toContain('test%20plan.md')
    expect(resolved.href).not.toContain('%25')
    expect(matched.name).toBe('file')
    expect(matched.params.filePath).toBe(filePath)
  })
})
