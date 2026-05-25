/**
 * T-TS-002 (TEST-TS-005) — RED: `PluginSettings.sessionsFolder` + `maxTabs`
 * (defaults `.specorator/sessions` / `3`), `MIN_TABS = 1` / `MAX_TABS_CEILING = 10`,
 * and the pure helpers `resolveSessionsFolder` (trim / strip slash / collapse //
 * / empty -> default; never '') + `clampMaxTabs` (0 -> 1, 99 -> 10, NaN -> 3,
 * 2.7 -> 2).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` (the new fields/helpers do not yet exist)
 * + the runtime assertions until T-TS-006 grows the settings + helpers.
 *
 * Traces: TEST-TS-005, SPEC-TS-005, REQ-TS-005/008, NFR-TS-013.
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_SETTINGS,
	MIN_TABS,
	MAX_TABS_CEILING,
	resolveSessionsFolder,
	clampMaxTabs,
	type PluginSettings,
} from '@/domain/settings/PluginSettings';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _sessionsFolder: Equals<PluginSettings['sessionsFolder'], string> = true;
const _maxTabs: Equals<PluginSettings['maxTabs'], number> = true;
void _sessionsFolder;
void _maxTabs;

describe('settings defaults + bounds (TEST-TS-005)', () => {
	it('defaults sessionsFolder to .specorator/sessions and maxTabs to 3', () => {
		expect(DEFAULT_SETTINGS.sessionsFolder).toBe('.specorator/sessions');
		expect(DEFAULT_SETTINGS.maxTabs).toBe(3);
	});

	it('exposes MIN_TABS = 1 and MAX_TABS_CEILING = 10', () => {
		expect(MIN_TABS).toBe(1);
		expect(MAX_TABS_CEILING).toBe(10);
	});
});

describe('resolveSessionsFolder (TEST-TS-005)', () => {
	it('trims surrounding whitespace', () => {
		expect(resolveSessionsFolder('  notes/sessions  ')).toBe('notes/sessions');
	});

	it('strips a leading and trailing slash', () => {
		expect(resolveSessionsFolder('/notes/sessions/')).toBe('notes/sessions');
	});

	it('collapses internal double slashes', () => {
		expect(resolveSessionsFolder('notes//sessions///deep')).toBe('notes/sessions/deep');
	});

	it('falls back to the default on an empty / whitespace-only input', () => {
		expect(resolveSessionsFolder('')).toBe(DEFAULT_SETTINGS.sessionsFolder);
		expect(resolveSessionsFolder('   ')).toBe(DEFAULT_SETTINGS.sessionsFolder);
		expect(resolveSessionsFolder('/')).toBe(DEFAULT_SETTINGS.sessionsFolder);
	});

	it('never returns an empty string', () => {
		expect(resolveSessionsFolder('//')).not.toBe('');
	});
});

describe('clampMaxTabs (TEST-TS-005)', () => {
	it('clamps below MIN_TABS up to 1', () => {
		expect(clampMaxTabs(0)).toBe(1);
		expect(clampMaxTabs(-5)).toBe(1);
	});

	it('clamps above the ceiling down to 10', () => {
		expect(clampMaxTabs(99)).toBe(10);
	});

	it('falls back to the default on NaN / non-finite', () => {
		expect(clampMaxTabs(Number.NaN)).toBe(3);
		expect(clampMaxTabs(Number.POSITIVE_INFINITY)).toBe(3);
	});

	it('truncates a fractional value toward zero (2.7 -> 2)', () => {
		expect(clampMaxTabs(2.7)).toBe(2);
	});

	it('passes an in-range integer through', () => {
		expect(clampMaxTabs(5)).toBe(5);
	});
});
