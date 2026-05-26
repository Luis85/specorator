/**
 * T-SS-010 (TEST-SS-070/071) — RED: the PURE `buildNavMappingText` /
 * `parseNavMappings` nav validator (regrown 1:1 from claudian
 * `features/settings/keyboardNavigation.ts:6-60`). Round-trip on valid w/s/i; an
 * `{error}` (never throws, nothing persisted) on a malformed / unknown-action /
 * multi-char / non-unique / duplicate-action / missing-action line. Defaults w/s/i.
 *
 * Fails until T-SS-011 adds `src/domain/settings/keyboardNav.ts`.
 *
 * Traces: TEST-SS-070, TEST-SS-071, SPEC-SS-005, REQ-SS-070/071, EC-SS-7.
 */
import { describe, it, expect } from 'vitest';
import {
	buildNavMappingText,
	parseNavMappings,
	type NavMappings,
} from '@/domain/settings/keyboardNav';

const DEFAULTS: NavMappings = { scrollUpKey: 'w', scrollDownKey: 's', focusInputKey: 'i' };

describe('buildNavMappingText (SPEC-SS-005)', () => {
	it('renders the canonical map <key> <action> text', () => {
		expect(buildNavMappingText(DEFAULTS)).toBe('map w scrollUp\nmap s scrollDown\nmap i focusInput');
	});
});

describe('parseNavMappings — valid (TEST-SS-070)', () => {
	it('parses valid w/s/i into a NavMappings', () => {
		const out = parseNavMappings('map w scrollUp\nmap s scrollDown\nmap i focusInput');
		expect(out.error).toBeUndefined();
		expect(out.settings).toEqual(DEFAULTS);
	});

	it('is the inverse of buildNavMappingText (round-trip)', () => {
		const custom: NavMappings = { scrollUpKey: 'k', scrollDownKey: 'j', focusInputKey: 'a' };
		const out = parseNavMappings(buildNavMappingText(custom));
		expect(out.settings).toEqual(custom);
	});

	it('skips blank lines', () => {
		const out = parseNavMappings('\nmap w scrollUp\n\nmap s scrollDown\nmap i focusInput\n');
		expect(out.settings).toEqual(DEFAULTS);
	});
});

describe('parseNavMappings — errors (TEST-SS-071, EC-SS-7)', () => {
	it('errors on a non-map / non-3-token line (nothing persisted)', () => {
		const out = parseNavMappings('jump w scrollUp');
		expect(out.settings).toBeUndefined();
		expect(out.error).toBeTruthy();
	});

	it('errors on an unknown action', () => {
		const out = parseNavMappings('map w scrollSideways\nmap s scrollDown\nmap i focusInput');
		expect(out.settings).toBeUndefined();
		expect(out.error).toContain('Unknown action');
	});

	it('errors on a multi-char key', () => {
		const out = parseNavMappings('map ww scrollUp\nmap s scrollDown\nmap i focusInput');
		expect(out.settings).toBeUndefined();
		expect(out.error).toContain('single character');
	});

	it('errors on a non-unique key (case-insensitive)', () => {
		const out = parseNavMappings('map w scrollUp\nmap W scrollDown\nmap i focusInput');
		expect(out.settings).toBeUndefined();
		expect(out.error).toContain('unique');
	});

	it('errors on a duplicate action', () => {
		const out = parseNavMappings('map w scrollUp\nmap s scrollUp\nmap i focusInput');
		expect(out.settings).toBeUndefined();
		expect(out.error).toBeTruthy();
	});

	it('errors on a missing action', () => {
		const out = parseNavMappings('map w scrollUp\nmap s scrollDown');
		expect(out.settings).toBeUndefined();
		expect(out.error).toContain('Missing');
	});

	it('is total — never throws on garbage', () => {
		expect(() => parseNavMappings('')).not.toThrow();
		expect(() => parseNavMappings('asdf qwer zxcv hjkl')).not.toThrow();
	});
});
