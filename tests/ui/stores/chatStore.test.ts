/**
 * T-CCS-012 — Tests for useChatStore() — state shape, all actions, deduplication, setActiveFile.
 * Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-013, REQ-CCS-014, REQ-CCS-016.
 * Maps to: TEST-CCS-009, TEST-CCS-STORE-001, TEST-CCS-STORE-002.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatStore } from '@/ui/stores/chatStore'
import type { ContextFileEntry } from '@/ui/stores/chatStore'

function makeFile(path: string, label?: string, isAuto = false): ContextFileEntry {
  return { path, label: label ?? path, isAuto }
}

describe('useChatStore()', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('contextFiles is empty', () => {
      const store = useChatStore()
      expect(store.contextFiles).toHaveLength(0)
    })

    it('userText is empty string', () => {
      const store = useChatStore()
      expect(store.userText).toBe('')
    })

    it('response is null', () => {
      const store = useChatStore()
      expect(store.response).toBeNull()
    })

    it('status is idle', () => {
      const store = useChatStore()
      expect(store.status).toBe('idle')
    })

    it('errorType is null', () => {
      const store = useChatStore()
      expect(store.errorType).toBeNull()
    })

    it('truncated is false', () => {
      const store = useChatStore()
      expect(store.truncated).toBe(false)
    })
  })

  describe('addContextFile', () => {
    it('appends a file to contextFiles', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('notes.md', 'notes.md'))
      expect(store.contextFiles).toHaveLength(1)
      expect(store.contextFiles[0].path).toBe('notes.md')
    })

    it('REQ-CCS-009: deduplication — second addContextFile with same path is no-op', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('notes.md', 'notes.md'))
      store.addContextFile(makeFile('notes.md', 'notes.md'))
      expect(store.contextFiles).toHaveLength(1)
    })

    it('appends different files independently', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('a.md'))
      store.addContextFile(makeFile('b.md'))
      expect(store.contextFiles).toHaveLength(2)
    })
  })

  describe('removeContextFile', () => {
    it('removes the entry with the matching path', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('notes.md'))
      store.removeContextFile('notes.md')
      expect(store.contextFiles).toHaveLength(0)
    })

    it('is a no-op when path is not found', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('notes.md'))
      store.removeContextFile('other.md')
      expect(store.contextFiles).toHaveLength(1)
    })
  })

  describe('setActiveFile', () => {
    // TEST-CCS-STORE-001: replaces existing auto entry
    it('REQ-CCS-005: replaces existing auto entry at index 0', () => {
      const store = useChatStore()
      store.setActiveFile(makeFile('old.md', 'old.md', true))
      store.setActiveFile(makeFile('new.md', 'new.md', true))
      expect(store.contextFiles).toHaveLength(1)
      expect(store.contextFiles[0].path).toBe('new.md')
    })

    it('inserts auto file at index 0 when no auto entry exists', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('manual.md'))
      store.setActiveFile(makeFile('auto.md', 'auto.md', true))
      expect(store.contextFiles[0].path).toBe('auto.md')
      expect(store.contextFiles[0].isAuto).toBe(true)
    })

    it('forces isAuto=true on the inserted entry', () => {
      const store = useChatStore()
      // Even if caller passes isAuto: false, setActiveFile forces it true
      store.setActiveFile({ path: 'file.md', label: 'file.md', isAuto: false })
      expect(store.contextFiles[0].isAuto).toBe(true)
    })

    it('does not affect manual entries when setting active file', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('manual.md'))
      store.setActiveFile(makeFile('auto.md', 'auto.md', true))
      expect(store.contextFiles).toHaveLength(2)
      expect(store.contextFiles[1].path).toBe('manual.md')
    })

    // TEST-CCS-STORE-002: setActiveFile(null) removes auto entry
    it('REQ-CCS-006: setActiveFile(null) removes the auto entry', () => {
      const store = useChatStore()
      store.setActiveFile(makeFile('auto.md', 'auto.md', true))
      store.addContextFile(makeFile('manual.md'))
      store.setActiveFile(null)
      expect(store.contextFiles).toHaveLength(1)
      expect(store.contextFiles[0].isAuto).toBe(false)
    })

    it('is a no-op when called with null and no auto entry exists', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('manual.md'))
      store.setActiveFile(null)
      expect(store.contextFiles).toHaveLength(1)
    })
  })

  describe('setUserText', () => {
    it('sets userText', () => {
      const store = useChatStore()
      store.setUserText('hello world')
      expect(store.userText).toBe('hello world')
    })
  })

  describe('beginRequest', () => {
    it('REQ-CCS-014: sets status to loading', () => {
      const store = useChatStore()
      store.beginRequest()
      expect(store.status).toBe('loading')
    })

    it('clears response', () => {
      const store = useChatStore()
      store.setResponse('old response', false)
      store.beginRequest()
      expect(store.response).toBeNull()
    })

    it('clears errorType', () => {
      const store = useChatStore()
      store.setError('timeout')
      store.beginRequest()
      expect(store.errorType).toBeNull()
    })

    it('clears truncated', () => {
      const store = useChatStore()
      store.setResponse('text', true)
      store.beginRequest()
      expect(store.truncated).toBe(false)
    })
  })

  describe('setResponse', () => {
    it('REQ-CCS-013: sets status to idle', () => {
      const store = useChatStore()
      store.beginRequest()
      store.setResponse('Hello world', false)
      expect(store.status).toBe('idle')
    })

    it('stores the response text', () => {
      const store = useChatStore()
      store.setResponse('Hello world', false)
      expect(store.response).toBe('Hello world')
    })

    it('stores the truncated flag', () => {
      const store = useChatStore()
      store.setResponse('text', true)
      expect(store.truncated).toBe(true)
    })
  })

  describe('setError', () => {
    it('REQ-CCS-016: sets status to error for timeout', () => {
      const store = useChatStore()
      store.setError('timeout')
      expect(store.status).toBe('error')
      expect(store.errorType).toBe('timeout')
    })

    it('sets status to error for query_failed', () => {
      const store = useChatStore()
      store.setError('query_failed')
      expect(store.status).toBe('error')
      expect(store.errorType).toBe('query_failed')
    })

    it('clears response', () => {
      const store = useChatStore()
      store.setResponse('old', false)
      store.setError('timeout')
      expect(store.response).toBeNull()
    })
  })

  describe('clearResponse', () => {
    it('resets to idle state', () => {
      const store = useChatStore()
      store.setError('timeout')
      store.clearResponse()
      expect(store.status).toBe('idle')
      expect(store.errorType).toBeNull()
      expect(store.response).toBeNull()
      expect(store.truncated).toBe(false)
    })
  })

  describe('reset', () => {
    it('restores initial state completely', () => {
      const store = useChatStore()
      store.addContextFile(makeFile('notes.md'))
      store.setUserText('some text')
      store.setResponse('resp', true)
      store.reset()
      expect(store.contextFiles).toHaveLength(0)
      expect(store.userText).toBe('')
      expect(store.response).toBeNull()
      expect(store.status).toBe('idle')
      expect(store.errorType).toBeNull()
      expect(store.truncated).toBe(false)
    })
  })
})
