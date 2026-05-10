import { describe, it, expect, vi } from 'vitest'
import { ProposalStore } from '@/infrastructure/obsidian/ProposalStore'

describe('ProposalStore', () => {
  describe('queue()', () => {
    it('returns a non-empty string proposalId', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', { path: 'a.md' }, async () => {})
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('returns a unique id for each call', () => {
      const store = new ProposalStore()
      const id1 = store.queue('vault_write_note', {}, async () => {})
      const id2 = store.queue('vault_write_note', {}, async () => {})
      expect(id1).not.toBe(id2)
    })
  })

  describe('getAll()', () => {
    it('returns queued proposal with status pending and correct shape', () => {
      const store = new ProposalStore()
      const params = { path: 'a.md', content: 'hi' }
      const id = store.queue('vault_write_note', params, async () => {})
      const all = store.getAll()
      expect(all).toHaveLength(1)
      expect(all[0]).toEqual({
        proposalId: id,
        toolName: 'vault_write_note',
        params,
        status: 'pending',
      })
    })

    it('does not expose mutate closure', () => {
      const store = new ProposalStore()
      store.queue('vault_write_note', {}, async () => {})
      const all = store.getAll()
      expect('mutate' in all[0]).toBe(false)
    })

    it('returns all queued proposals', () => {
      const store = new ProposalStore()
      store.queue('vault_write_note', {}, async () => {})
      store.queue('vault_append_to_note', {}, async () => {})
      expect(store.getAll()).toHaveLength(2)
    })
  })

  describe('get()', () => {
    it('returns the proposal for a known id', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', { path: 'x.md' }, async () => {})
      const p = store.get(id)
      expect(p?.proposalId).toBe(id)
      expect(p?.status).toBe('pending')
    })

    it('returns undefined for unknown id', () => {
      const store = new ProposalStore()
      expect(store.get('no-such-id')).toBeUndefined()
    })

    it('does not expose mutate closure', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      expect('mutate' in store.get(id)!).toBe(false)
    })

    it('returns a deep copy of params — mutating returned value does not affect queued closure', async () => {
      const params = { fields: { status: 'pending' } }
      const captured: Record<string, unknown>[] = []
      const store = new ProposalStore()
      const id = store.queue('frontmatter_set_many', params, async () => { captured.push(params.fields) })
      const snapshot = store.get(id)!.params as typeof params
      snapshot.fields.status = 'mutated'
      await store.accept(id)
      expect(captured[0].status).toBe('pending')
    })
  })

  describe('accept()', () => {
    it('calls mutate fn exactly once and sets status to accepted', async () => {
      const store = new ProposalStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = store.queue('vault_write_note', {}, mutate)
      await store.accept(id)
      expect(mutate).toHaveBeenCalledOnce()
      expect(store.get(id)?.status).toBe('accepted')
    })

    it('throws on unknown id', async () => {
      const store = new ProposalStore()
      await expect(store.accept('no-such-id')).rejects.toThrow('no-such-id')
    })

    it('throws when already accepted', async () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      await store.accept(id)
      await expect(store.accept(id)).rejects.toThrow(id)
    })

    it('throws when already rejected', async () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      store.reject(id)
      await expect(store.accept(id)).rejects.toThrow(id)
    })

    it('leaves status pending and allows retry when mutate throws', async () => {
      const store = new ProposalStore()
      const mutate = vi.fn().mockRejectedValueOnce(new Error('vault error')).mockResolvedValue(undefined)
      const id = store.queue('vault_write_note', {}, mutate)
      await expect(store.accept(id)).rejects.toThrow('vault error')
      expect(store.get(id)?.status).toBe('pending')
      await store.accept(id)
      expect(store.get(id)?.status).toBe('accepted')
      expect(mutate).toHaveBeenCalledTimes(2)
    })
  })

  describe('reject()', () => {
    it('sets status to rejected without calling mutate', () => {
      const store = new ProposalStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = store.queue('vault_write_note', {}, mutate)
      store.reject(id)
      expect(mutate).not.toHaveBeenCalled()
      expect(store.get(id)?.status).toBe('rejected')
    })

    it('throws on unknown id', () => {
      const store = new ProposalStore()
      expect(() => { store.reject('no-such-id') }).toThrow('no-such-id')
    })

    it('throws when already accepted', async () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      await store.accept(id)
      expect(() => { store.reject(id) }).toThrow(id)
    })

    it('throws when already rejected', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      store.reject(id)
      expect(() => { store.reject(id) }).toThrow(id)
    })
  })
})
