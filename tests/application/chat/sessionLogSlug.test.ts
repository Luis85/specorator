/**
 * Q-E.1 — Tests for `slugifyForSessionLog`.
 *
 * Pure helper used to generate human-readable session-log filenames from the
 * first user message of a thread. Tests cover the normalisation contract
 * declared in the module header.
 */
import { describe, it, expect } from 'vitest'
import { slugifyForSessionLog } from '@/application/chat/sessionLogSlug'

describe('slugifyForSessionLog', () => {
	it('lowercases ASCII letters and replaces spaces with single dashes', () => {
		expect(slugifyForSessionLog('Hello World')).toBe('hello-world')
	})

	it('collapses runs of separators to a single dash', () => {
		expect(slugifyForSessionLog('a   b___c!!!d')).toBe('a-b-c-d')
	})

	it('trims leading and trailing dashes', () => {
		expect(slugifyForSessionLog('  !!hello!!  ')).toBe('hello')
	})

	it('returns "untitled" for an empty string', () => {
		expect(slugifyForSessionLog('')).toBe('untitled')
	})

	it('returns "untitled" for a whitespace-only string', () => {
		expect(slugifyForSessionLog('   \n\t  ')).toBe('untitled')
	})

	it('returns "untitled" when the input has no ASCII alphanumerics', () => {
		expect(slugifyForSessionLog('!!! ??? ###')).toBe('untitled')
	})

	it('returns "untitled" for unicode-only input that strips to nothing', () => {
		expect(slugifyForSessionLog('🍕 ☕ 🚀')).toBe('untitled')
	})

	it('strips diacritics via NFKD so umlauts collapse to ASCII letters', () => {
		expect(slugifyForSessionLog('Über-Note 🍕 ☕')).toBe('uber-note')
	})

	it('strips diacritics on common Latin accents', () => {
		expect(slugifyForSessionLog('Café résumé')).toBe('cafe-resume')
	})

	it('output is ASCII-only — no unicode letters survive', () => {
		const out = slugifyForSessionLog('日本語 hello 世界')
		expect(out).toMatch(/^[a-z0-9-]+$/)
		expect(out).toBe('hello')
	})

	it('truncates to maxLen and trims a trailing dash created by the cut', () => {
		const long = 'a-very-long-message-that-exceeds-the-default-forty-char-cap-by-a-lot'
		const out = slugifyForSessionLog(long)
		expect(out.length).toBeLessThanOrEqual(40)
		expect(out.endsWith('-')).toBe(false)
		expect(out).toBe('a-very-long-message-that-exceeds-the-def')
	})

	it('honours a custom maxLen', () => {
		expect(slugifyForSessionLog('hello world how are you', 10)).toBe('hello-worl')
	})

	it('preserves digits', () => {
		expect(slugifyForSessionLog('Spec 001 v2')).toBe('spec-001-v2')
	})

	it('is deterministic — same input yields same output', () => {
		const a = slugifyForSessionLog('Hello, World!')
		const b = slugifyForSessionLog('Hello, World!')
		expect(a).toBe(b)
	})
})
