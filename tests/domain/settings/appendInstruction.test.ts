/**
 * T-CP-005 (TEST-CP-005 helper leg) — RED: the pure `appendInstruction(existing,
 * instruction)` helper (empty existing -> raw instruction; non-empty -> `existing
 * + '\n\n' + instruction`) and `PluginSettings.customSystemPrompt` default `''`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-007 adds the field + helper.
 *
 * Traces: TEST-CP-005, SPEC-CP-005, REQ-CP-018, NFR-CP-010.
 */
import { describe, it, expect } from 'vitest';
import {
	appendInstruction,
	DEFAULT_SETTINGS,
	type PluginSettings,
} from '@/domain/settings/PluginSettings';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// customSystemPrompt is a string field on PluginSettings.
const _field: Equals<PluginSettings['customSystemPrompt'], string> = true;
void _field;

describe('appendInstruction + customSystemPrompt (TEST-CP-005)', () => {
	it('empty existing -> the raw instruction', () => {
		expect(appendInstruction('', 'be concise')).toBe('be concise');
	});

	it('non-empty existing -> existing + \\n\\n + instruction', () => {
		expect(appendInstruction('prior rule', 'be concise')).toBe('prior rule\n\nbe concise');
	});

	it('append preserves the prior content (never overwrites, REQ-CP-018)', () => {
		const after = appendInstruction(appendInstruction('', 'one'), 'two');
		expect(after).toBe('one\n\ntwo');
	});

	it('customSystemPrompt defaults to empty string', () => {
		expect(DEFAULT_SETTINGS.customSystemPrompt).toBe('');
	});
});
