import { describe, it, expect } from 'vitest'
import { i18nMerge } from '@/ui/i18n'

describe('i18nMerge / flatToNested', () => {
  it('merges flat dot-key messages without error', () => {
    expect(() => { i18nMerge('en', { 'hello.title': 'Hello' }) }).not.toThrow()
  })

  it('throws when a leaf key conflicts with an existing parent', () => {
    expect(() => {
      i18nMerge('en', { 'a.b': 'child', a: 'parent' })
    }).toThrow(/i18n key collision/)
  })

  it('throws when a parent traversal conflicts with an existing leaf', () => {
    expect(() => {
      i18nMerge('en', { a: 'leaf', 'a.b': 'child' })
    }).toThrow(/i18n key collision/)
  })

  it('accepts sibling keys without error', () => {
    expect(() => { i18nMerge('en', { 'a.x': 'X', 'a.y': 'Y' }) }).not.toThrow()
  })

  it('rejects __proto__ segment', () => {
    expect(() => { i18nMerge('en', { '__proto__.polluted': 'x' }) }).toThrow(/forbidden segment/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects prototype segment', () => {
    expect(() => { i18nMerge('en', { 'prototype.polluted': 'x' }) }).toThrow(/forbidden segment/)
  })

  it('rejects constructor segment', () => {
    expect(() => { i18nMerge('en', { 'constructor.polluted': 'x' }) }).toThrow(/forbidden segment/)
  })

  it('does not treat inherited toString as a colliding parent', () => {
    expect(() => { i18nMerge('en', { 'toString.x': 'X' }) }).not.toThrow()
  })
})
