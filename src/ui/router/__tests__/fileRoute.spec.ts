import { describe, expect, it } from 'vitest'
import { router } from '../index'
import { normalizeFileRoutePath } from '../fileRoute'

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

  it('normalizes legacy double-encoded file route paths', () => {
    const legacyRouteParam = 'specs%2FÜber%20cool%20feature%2Ftest%20plan.md'

    expect(normalizeFileRoutePath(legacyRouteParam)).toBe('specs/Über cool feature/test plan.md')
  })

  it('normalizes legacy single-segment file route paths', () => {
    expect(normalizeFileRoutePath('My%20Note.md')).toBe('My Note.md')
  })

  it('preserves percent-like literals in current slash-containing paths', () => {
    expect(normalizeFileRoutePath('docs/100%2Fready.md')).toBe('docs/100%2Fready.md')
  })
})
