import { describe, it, expect } from 'vitest'
import { Feature } from '../Feature'
import { Slug } from '../../shared/Slug'
import { FEATURE_STEP_COUNT } from '../FeatureStep'

function makeSlug(raw = 'dark-mode') {
  const r = Slug.create(raw)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

function makeFeature(title = 'Dark mode') {
  const r = Feature.create('id-1', makeSlug(title), title)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('Feature', () => {
  describe('create', () => {
    it('creates a draft feature with step 1', () => {
      const f = makeFeature()
      expect(f.status).toBe('draft')
      expect(f.currentStep).toBe(1)
    })

    it('trims the title', () => {
      const r = Feature.create('id-2', makeSlug('my-feature'), '  My Feature  ')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.title).toBe('My Feature')
    })

    it('rejects an empty title', () => {
      const r = Feature.create('id-3', makeSlug('empty'), '   ')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.message).toMatch(/empty/)
    })
  })

  describe('activate', () => {
    it('transitions draft → active', () => {
      const r = makeFeature().activate()
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.status).toBe('active')
    })

    it('rejects activating an already-active feature', () => {
      const active = makeFeature().activate()
      if (!active.ok) throw new Error()
      const r = active.value.activate()
      expect(r.ok).toBe(false)
    })
  })

  describe('advanceStep', () => {
    it('increments currentStep on active feature', () => {
      const active = makeFeature().activate()
      if (!active.ok) throw new Error()
      const r = active.value.advanceStep()
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.currentStep).toBe(2)
    })

    it('refuses to advance a draft feature', () => {
      const r = makeFeature().advanceStep()
      expect(r.ok).toBe(false)
    })

    it(`refuses to advance past step ${FEATURE_STEP_COUNT}`, () => {
      let feature = Feature.reconstitute({
        id: 'id-last',
        slug: makeSlug('last'),
        title: 'Last',
        status: 'active',
        currentStep: FEATURE_STEP_COUNT,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      const r = feature.advanceStep()
      // Step count means it's the last step — advancing should succeed (moves beyond)
      // then the next advance should fail (isComplete = true)
      if (!r.ok) throw r.error
      feature = r.value
      expect(feature.isComplete).toBe(true)
      const r2 = feature.advanceStep()
      expect(r2.ok).toBe(false)
    })
  })

  describe('archive', () => {
    it('archives a draft feature', () => {
      const r = makeFeature().archive()
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.status).toBe('archived')
    })

    it('refuses to archive an already-archived feature', () => {
      const archived = makeFeature().archive()
      if (!archived.ok) throw new Error()
      const r = archived.value.archive()
      expect(r.ok).toBe(false)
    })
  })

  describe('toPlainObject', () => {
    it('serialises slug as a string', () => {
      const f = makeFeature()
      expect(f.toPlainObject().slug).toBe('dark-mode')
    })
  })
})
