/**
 * Tests for the built-in slash command registry (PR-ASV-3, D-ASV-2). Covers
 * shape invariants — names are unique kebab-case, every action is a known
 * dispatch id, the array is frozen, and the four expected built-ins are
 * present.
 */
import { describe, it, expect } from 'vitest';

import { BUILT_IN_SLASH_COMMANDS } from '@/application/chat/builtInSlashCommands';
import type { SlashCommandAction } from '@/domain/chat/SlashCommand';

const KNOWN_ACTIONS: ReadonlySet<SlashCommandAction> = new Set<SlashCommandAction>([
	'clear-input',
	'new-conversation',
	'help',
	'advance-stage',
]);

describe('BUILT_IN_SLASH_COMMANDS', () => {
	it('exposes the four PR-ASV-3 built-ins', () => {
		const names = BUILT_IN_SLASH_COMMANDS.map((c) => c.name).sort();
		expect(names).toEqual(['advance-stage', 'clear', 'help', 'new']);
	});

	it('is frozen so consumers cannot mutate the registry', () => {
		expect(Object.isFrozen(BUILT_IN_SLASH_COMMANDS)).toBe(true);
		// Every individual entry is frozen so a caller cannot rewrite an entry
		// in place either.
		for (const command of BUILT_IN_SLASH_COMMANDS) {
			expect(Object.isFrozen(command)).toBe(true);
		}
	});

	it('every command declares kind "builtin"', () => {
		for (const command of BUILT_IN_SLASH_COMMANDS) {
			expect(command.kind).toBe('builtin');
		}
	});

	it('every command action is one of the known dispatch ids', () => {
		for (const command of BUILT_IN_SLASH_COMMANDS) {
			expect(KNOWN_ACTIONS.has(command.action)).toBe(true);
		}
	});

	it('command names are unique and kebab-case', () => {
		const names = BUILT_IN_SLASH_COMMANDS.map((c) => c.name);
		expect(new Set(names).size).toBe(names.length);
		for (const name of names) {
			expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
		}
	});

	it('every command carries a non-empty description', () => {
		for (const command of BUILT_IN_SLASH_COMMANDS) {
			expect(command.description.length).toBeGreaterThan(0);
		}
	});
});
