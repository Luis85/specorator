import { describe, it, expect } from 'vitest';
import { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import type { CatalogEntry } from '@/domain/ports';

/**
 * TEST-CP-008 (RunCommandUseCase leg) — dispatch a selected catalog entry
 * (SPEC-CP-013, REQ-CP-005/006, EC-CP-11). A built-in action entry resolves
 * {kind:'action'} (e.g. /clear → 'clear', NOT inserted text); a provider entry
 * resolves {kind:'insert'; text: prefix+name+' '}; `$` vs `/` prefix is distinct.
 * Result-returning.
 */
const clearBuiltIn: CatalogEntry = {
	kind: 'command',
	prefix: '/',
	name: 'clear',
	description: 'Start a new conversation',
	builtIn: true,
};

const providerCommand: CatalogEntry = {
	kind: 'command',
	prefix: '/',
	name: 'deploy',
	description: 'Deploy the project',
	builtIn: false,
};

const providerSkill: CatalogEntry = {
	kind: 'skill',
	prefix: '$',
	name: 'summarise',
	builtIn: false,
};

describe('TEST-CP-008 RunCommandUseCase', () => {
	it('resolves a built-in action entry to {kind:action} (REQ-CP-006)', async () => {
		const result = await new RunCommandUseCase().execute(clearBuiltIn);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ kind: 'action', action: 'clear' });
	});

	it('resolves a provider command to {kind:insert; text:`/deploy `} (REQ-CP-005)', async () => {
		const result = await new RunCommandUseCase().execute(providerCommand);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ kind: 'insert', text: '/deploy ' });
	});

	it('resolves a provider skill with the `$` prefix (EC-CP-11)', async () => {
		const result = await new RunCommandUseCase().execute(providerSkill);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ kind: 'insert', text: '$summarise ' });
	});

	it('maps every action built-in to its action kind', async () => {
		const names: Array<{ name: string; action: string }> = [
			{ name: 'clear', action: 'clear' },
			{ name: 'new', action: 'new' },
			{ name: 'add-dir', action: 'add-dir' },
			{ name: 'resume', action: 'resume' },
			{ name: 'fork', action: 'fork' },
			{ name: 'compact', action: 'compact' },
		];
		for (const { name, action } of names) {
			const entry: CatalogEntry = { kind: 'command', prefix: '/', name, builtIn: true };
			const result = await new RunCommandUseCase().execute(entry);
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			expect(result.value).toEqual({ kind: 'action', action });
		}
	});
});
