import { describe, it, expect } from 'vitest';
import {
	detectTrigger,
	shouldEnterInstruction,
	shouldEnterBangBash,
	replaceTriggerToken,
} from '@/application/chat/composer/triggerParse';

/**
 * TEST-CP-007 — pure trigger-parse (SPEC-CP-012, REQ-CP-001/002/007/008/015/029/036).
 * Ported from claudian `SlashCommandDropdown.handleInputChange` (slash/skills
 * start-of-token + whitespace-closes) + `MentionDropdownController` (the `@`-token
 * scan) + the empty-input gates of the mode managers. Every function is pure/total —
 * never throws, no side effects. Covers EC-CP-1 (mid-word), EC-CP-2 (whitespace
 * closes), EC-CP-4 (`@no` survives a cancel via replaceTriggerToken), EC-CP-10
 * (multiple tokens — classify the one the caret sits in).
 */
describe('TEST-CP-007 detectTrigger — slash / skills', () => {
	it('returns a slash hit when `/` is at start-of-token (index 0)', () => {
		const value = '/dep';
		const hit = detectTrigger(value, value.length);
		expect(hit).toEqual({ kind: 'slash', tokenStart: 0, filter: 'dep' });
	});

	it('returns a skills hit when `$` is at start-of-token', () => {
		const value = '$sum';
		const hit = detectTrigger(value, value.length);
		expect(hit).toEqual({ kind: 'skills', tokenStart: 0, filter: 'sum' });
	});

	it('returns a slash hit when `/` immediately follows whitespace', () => {
		const value = 'run /cle';
		const hit = detectTrigger(value, value.length);
		expect(hit).toEqual({ kind: 'slash', tokenStart: 4, filter: 'cle' });
	});

	it('returns null for a mid-word `/` (EC-CP-1)', () => {
		const value = 'a/b';
		expect(detectTrigger(value, value.length)).toBeNull();
	});

	it('returns null when a whitespace is typed into a slash filter (palette closes, EC-CP-2)', () => {
		const value = '/clear now';
		expect(detectTrigger(value, value.length)).toBeNull();
	});

	it('classifies by the caret position, not the end of the value', () => {
		const value = '/clear';
		// caret right after the `/` with no filter typed yet.
		const hit = detectTrigger(value, 1);
		expect(hit).toEqual({ kind: 'slash', tokenStart: 0, filter: '' });
	});
});

describe('TEST-CP-007 detectTrigger — mention', () => {
	it('returns a mention hit for an `@` at start-of-token', () => {
		const value = '@notes';
		const hit = detectTrigger(value, value.length);
		expect(hit).toEqual({ kind: 'mention', tokenStart: 0, filter: 'notes' });
	});

	it('returns a mention hit for an `@` mid-value preceded by whitespace', () => {
		const value = 'look at @no';
		const hit = detectTrigger(value, value.length);
		expect(hit).toEqual({ kind: 'mention', tokenStart: 8, filter: 'no' });
	});

	it('classifies the token the caret sits in when several `@` tokens exist (EC-CP-10)', () => {
		const value = '@first @second';
		// caret inside the second token.
		const hit = detectTrigger(value, value.length);
		expect(hit).toEqual({ kind: 'mention', tokenStart: 7, filter: 'second' });
	});

	it('returns null when there is no trigger char before the caret', () => {
		const value = 'plain text';
		expect(detectTrigger(value, value.length)).toBeNull();
	});
});

describe('TEST-CP-007 shouldEnterInstruction / shouldEnterBangBash', () => {
	it('enters instruction only when the WHOLE value is empty/whitespace (REQ-CP-015)', () => {
		expect(shouldEnterInstruction('')).toBe(true);
		expect(shouldEnterInstruction('   ')).toBe(true);
		expect(shouldEnterInstruction('a')).toBe(false);
		expect(shouldEnterInstruction(' x ')).toBe(false);
	});

	it('enters bang-bash only when the WHOLE value is empty/whitespace (REQ-CP-029)', () => {
		expect(shouldEnterBangBash('')).toBe(true);
		expect(shouldEnterBangBash('\t')).toBe(true);
		expect(shouldEnterBangBash('ls')).toBe(false);
	});
});

describe('TEST-CP-007 replaceTriggerToken', () => {
	it('rewrites only the [tokenStart, caret] span, preserving text outside', () => {
		const value = 'look at @no more';
		// the `@no` token spans [8, 11]; caret at 11.
		const out = replaceTriggerToken(value, 8, 11, '@notes.md');
		expect(out.value).toBe('look at @notes.md more');
		expect(out.caret).toBe(8 + '@notes.md'.length);
	});

	it('inserts a slash command with the trailing space the consumer supplies', () => {
		const value = '/cle';
		const out = replaceTriggerToken(value, 0, 4, '/clear ');
		expect(out.value).toBe('/clear ');
		expect(out.caret).toBe('/clear '.length);
	});

	it('leaves the text intact when the insertion equals the original token (cancel-safe, EC-CP-4)', () => {
		const value = 'look at @no';
		const out = replaceTriggerToken(value, 8, value.length, '@no');
		expect(out.value).toBe('look at @no');
		expect(out.caret).toBe(value.length);
	});
});
