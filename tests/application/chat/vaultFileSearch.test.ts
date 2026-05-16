/**
 * Tests for the pure `vaultFileSearch` helpers backing the `@`-file
 * mention picker (PR-ASV-4 / D-ASV-3). Pure-function tests — no Vue, no
 * timers, no port mocks beyond a `VaultPort`-shaped fixture for the
 * recursive walk.
 */
import { describe, it, expect } from 'vitest'
import {
	MENTION_RESULT_CAP,
	basenameOf,
	collectVaultFiles,
	matchAndRank,
	prepareCandidates,
} from '@/application/chat/vaultFileSearch'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

describe('vaultFileSearch.basenameOf', () => {
	it('returns the last path segment', () => {
		expect(basenameOf('specs/foo/idea.md')).toBe('idea.md')
	})

	it('handles top-level paths', () => {
		expect(basenameOf('README.md')).toBe('README.md')
	})

	it('handles empty strings', () => {
		expect(basenameOf('')).toBe('')
	})
})

describe('vaultFileSearch.collectVaultFiles', () => {
	it('walks nested folders recursively', async () => {
		const bridge = new MockBridge({
			'README.md': '',
			'specs/foo/idea.md': '',
			'specs/foo/requirements.md': '',
			'specs/bar/idea.md': '',
		})
		const out = await collectVaultFiles(bridge, '')
		expect(out.sort()).toEqual([
			'README.md',
			'specs/bar/idea.md',
			'specs/foo/idea.md',
			'specs/foo/requirements.md',
		])
	})

	it('returns an empty array for an empty vault', async () => {
		const bridge = new MockBridge({})
		expect(await collectVaultFiles(bridge, '')).toEqual([])
	})

	it('honours non-empty root parameter', async () => {
		const bridge = new MockBridge({
			'a/x.md': '',
			'b/y.md': '',
		})
		const out = await collectVaultFiles(bridge, 'a')
		expect(out).toEqual(['a/x.md'])
	})
})

describe('vaultFileSearch.matchAndRank', () => {
	const paths = [
		'README.md',
		'specs/foo/idea.md',
		'specs/foo/requirements.md',
		'specs/bar/requirements.md',
		'specs/zzz/requirements-extras.md',
	]
	const candidates = prepareCandidates(paths)

	it('substring-matches on the basename', () => {
		const out = matchAndRank(candidates, 'idea')
		expect(out.map((c) => c.path)).toEqual(['specs/foo/idea.md'])
	})

	it('substring-matches on the full path', () => {
		const out = matchAndRank(candidates, 'bar')
		expect(out.map((c) => c.path)).toEqual(['specs/bar/requirements.md'])
	})

	it('is case-insensitive', () => {
		const out = matchAndRank(candidates, 'IDEA')
		expect(out.map((c) => c.path)).toEqual(['specs/foo/idea.md'])
	})

	it('sorts filename-prefix matches before contains-only matches', () => {
		// "requirements" prefix-matches `requirements.md` and
		// `requirements-extras.md`; the other entries only contain it
		// elsewhere in the path. The two prefix matches come first; ties
		// among them break on path lexicographic order.
		const out = matchAndRank(candidates, 'requirements')
		expect(out.map((c) => c.path)).toEqual([
			'specs/bar/requirements.md',
			'specs/foo/requirements.md',
			'specs/zzz/requirements-extras.md',
		])
	})

	it('further ties broken by path ascending lexicographic order', () => {
		const out = matchAndRank(prepareCandidates(['a/z.md', 'a/a.md', 'b/m.md']), '.md')
		expect(out.map((c) => c.path)).toEqual(['a/a.md', 'a/z.md', 'b/m.md'])
	})

	it('caps results at MENTION_RESULT_CAP', () => {
		const many = Array.from({ length: 200 }, (_, i) => `notes/${i.toString().padStart(4, '0')}.md`)
		const out = matchAndRank(prepareCandidates(many), '.md')
		expect(out.length).toBe(MENTION_RESULT_CAP)
		expect(out[0].path).toBe('notes/0000.md')
	})

	it('empty query returns capped-prefix slice of vault', () => {
		const out = matchAndRank(candidates, '')
		expect(out.length).toBeGreaterThan(0)
		expect(out.length).toBeLessThanOrEqual(MENTION_RESULT_CAP)
	})

	it('non-matching query returns empty array', () => {
		const out = matchAndRank(candidates, 'zzzzz-not-present')
		expect(out).toEqual([])
	})
})
