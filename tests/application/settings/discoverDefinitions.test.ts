/**
 * RED → green unit tests for the read-only discovery mapping (SPEC-SS-008,
 * T-SS-016/017). The slash/skill lists read the P4 `ProviderCommandCatalogPort`
 * (load-or-default `[]`, never throws); they are read-only (no create/edit/delete
 * affordance); the agent list falls back to the skill entries and is OMITTED
 * entirely when both the `command` and `skill` catalogs are empty.
 *
 * TEST-SS-030/031/040/041.
 */
import { describe, it, expect } from 'vitest';
import {
	discoverDefinitions,
	makeHasProviderDefinitions,
} from '@/application/settings/discoverDefinitions';
import type {
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
} from '@/domain/ports/ProviderCommandCatalogPort';

function stubCatalog(commands: CatalogEntry[], skills: CatalogEntry[]): ProviderCommandCatalogPort {
	return {
		getEntries(kind: CatalogEntryKind): Promise<CatalogEntry[]> {
			return Promise.resolve(kind === 'command' ? [...commands] : [...skills]);
		},
	};
}

const command = (name: string, description?: string): CatalogEntry => ({
	kind: 'command',
	prefix: '/',
	name,
	builtIn: false,
	...(description !== undefined ? { description } : {}),
});
const skill = (name: string, description?: string): CatalogEntry => ({
	kind: 'skill',
	prefix: '$',
	name,
	builtIn: false,
	...(description !== undefined ? { description } : {}),
});

describe('discoverDefinitions — read-only command→slash + skill→agent mapping (TEST-SS-040)', () => {
	it('maps command entries to read-only slash {name, description}', async () => {
		const catalog = stubCatalog([command('review', 'Review code'), command('plan')], []);
		const result = await discoverDefinitions(catalog);
		expect(result.slash).toEqual([
			{ name: 'review', description: 'Review code' },
			{ name: 'plan', description: '' },
		]);
	});

	it('maps skill entries to read-only agent {name, description, kind}', async () => {
		const catalog = stubCatalog([], [skill('auditor', 'Audits the vault')]);
		const result = await discoverDefinitions(catalog);
		expect(result.agent).toEqual([{ name: 'auditor', description: 'Audits the vault', kind: 'skill' }]);
	});

	it('exposes no create/edit/delete affordance on the mapped rows (TEST-SS-041, EC-SS-9)', async () => {
		const catalog = stubCatalog([command('review')], [skill('auditor')]);
		const result = await discoverDefinitions(catalog);
		for (const row of [...result.slash, ...result.agent]) {
			expect('onChange' in row).toBe(false);
			expect('onCreate' in row).toBe(false);
			expect('onDelete' in row).toBe(false);
		}
	});
});

describe('discoverDefinitions — load-or-default, never throws (TEST-SS-030)', () => {
	it('returns empty lists when the catalog throws', async () => {
		const failing: ProviderCommandCatalogPort = {
			getEntries: () => Promise.reject(new Error('boom')),
		};
		const result = await discoverDefinitions(failing);
		expect(result.slash).toEqual([]);
		expect(result.agent).toEqual([]);
	});

	it('returns empty lists for an empty catalog', async () => {
		const result = await discoverDefinitions(stubCatalog([], []));
		expect(result.slash).toEqual([]);
		expect(result.agent).toEqual([]);
	});
});

describe('makeHasProviderDefinitions — presence predicate (TEST-SS-031, EC-SS-9)', () => {
	it('reports slash/skill true when the catalogs are non-empty and agent always false (no P9 seam)', async () => {
		const has = await makeHasProviderDefinitions(stubCatalog([command('review')], [skill('auditor')]));
		expect(has('claude')).toEqual({ slash: true, skill: true, agent: false });
	});

	it('omits the agent list (skill false) AND slash false when both catalogs are empty', async () => {
		const has = await makeHasProviderDefinitions(stubCatalog([], []));
		expect(has('claude')).toEqual({ slash: false, skill: false, agent: false });
	});

	it('reports slash false / skill true when only skills exist', async () => {
		const has = await makeHasProviderDefinitions(stubCatalog([], [skill('auditor')]));
		expect(has('codex')).toEqual({ slash: false, skill: true, agent: false });
	});
});
