import { describe, it, expect } from 'vitest';
import {
	BUILT_IN_COMMANDS,
	HIDDEN_COMMANDS,
	listBuiltInCommands,
} from '@/application/chat/composer/builtInCommands';

/**
 * TEST-CP-008 (built-ins leg) — the pure built-in command list (SPEC-CP-013,
 * REQ-CP-003, EC-CP-8). The six built-ins (/clear /new /add-dir /resume /fork
 * /compact) list independent of any catalog load, each builtIn:true prefix:'/';
 * HIDDEN_COMMANDS are excluded.
 */
describe('TEST-CP-008 listBuiltInCommands', () => {
	it('lists the six built-ins with no catalog load (REQ-CP-003)', () => {
		const names = listBuiltInCommands().map((c) => c.name);
		expect(names).toEqual(
			expect.arrayContaining(['clear', 'new', 'add-dir', 'resume', 'fork', 'compact']),
		);
	});

	it('marks every built-in builtIn:true with the `/` prefix and kind command', () => {
		for (const entry of listBuiltInCommands()) {
			expect(entry.builtIn).toBe(true);
			expect(entry.prefix).toBe('/');
			expect(entry.kind).toBe('command');
		}
	});

	it('excludes the HIDDEN_COMMANDS set (EC-CP-8)', () => {
		const listed = new Set(listBuiltInCommands().map((c) => c.name));
		for (const hidden of HIDDEN_COMMANDS) {
			expect(listed.has(hidden)).toBe(false);
		}
	});

	it('lists a subset of (or all) BUILT_IN_COMMANDS — never a hidden one', () => {
		const all = new Set(BUILT_IN_COMMANDS.map((c) => c.name));
		for (const entry of listBuiltInCommands()) {
			expect(all.has(entry.name)).toBe(true);
		}
	});
});
