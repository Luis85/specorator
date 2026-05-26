/**
 * RED → green unit tests for `EnvSnippetService` (SPEC-SS-009, T-SS-018/019)
 * over `fake-ports` (`secretStore` + `settings`). Covers the per-method contract:
 * list/create/edit/remove/apply/applyScopeText/readScope, the secret-split
 * (secret values via SecretStorePort under env.<scope>.<KEY>; the struct holds
 * only a secretRef), the name guard, the remove-both-stores, the apply
 * scope-inference, the review keys, the zero-secret-bytes store-content
 * assertion, the masked-secretRef readScope, the Result.err-on-failure (no value
 * substring), and the no-switch(providerId) source guard.
 *
 * TEST-SS-052/053/060/061/062/063/064/066/067/090/094.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports';
import { createEnvSnippetService, type EnvSnippetService } from '@/application/settings/EnvSnippetService';
import { PROVIDER_DESCRIPTORS } from '@/domain/chat/providers';
import { envSecretKey } from '@/domain/settings/PluginSettings';

let ports: FakePorts;
let service: EnvSnippetService;

beforeEach(() => {
	ports = fakeModulePorts();
	service = createEnvSnippetService({
		settings: ports.settings,
		secretStore: ports.secretStore,
		descriptors: PROVIDER_DESCRIPTORS,
	});
});

async function dataJsonString(): Promise<string> {
	return JSON.stringify(await ports.settings.getSettings());
}

describe('EnvSnippetService.list (TEST-SS-060)', () => {
	it('returns [] when no snippets are recorded (load-or-default)', async () => {
		const result = await service.list();
		expect(result.ok).toBe(true);
		expect(result.ok && result.value).toEqual([]);
	});

	it('returns the persisted snippets after a create round-trip', async () => {
		await service.create({ name: 'prod', envText: 'FOO=bar' });
		const result = await service.list();
		expect(result.ok && result.value.length).toBe(1);
		expect(result.ok && result.value[0].name).toBe('prod');
	});
});

describe('EnvSnippetService.create — name guard (TEST-SS-063, EC-SS-11)', () => {
	it('errors on an empty name and persists nothing', async () => {
		const before = await dataJsonString();
		const result = await service.create({ name: '   ', envText: 'FOO=bar' });
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error.message).toContain('settings.envSnippets.nameRequired');
		expect(await dataJsonString()).toBe(before);
		expect(ports.secretStore.getStoredKeys()).toEqual([]);
	});
});

describe('EnvSnippetService.create — secret split (TEST-SS-066/090, EC-SS-5)', () => {
	it('routes a provider-owned auth value to SecretStorePort, keeping only a secretRef in the struct', async () => {
		const result = await service.create({
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_API_KEY=sk-secret-123\nOPENAI_BASE_URL=https://api',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const struct = result.value;
		const apiKeyEntry = struct.envEntries.find((e) => e.key === 'OPENAI_API_KEY');
		const baseUrlEntry = struct.envEntries.find((e) => e.key === 'OPENAI_BASE_URL');
		expect(apiKeyEntry?.value.kind).toBe('secretRef');
		expect(baseUrlEntry?.value.kind).toBe('inline');
		// The secret value lives in the SecretStorePort under env.<scope>.<KEY>.
		const ref = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		expect(ports.secretStore.getStoredKeys()).toContain(ref);
		const stored = await ports.secretStore.getSecret(ref);
		expect(stored.ok && stored.value).toBe('sk-secret-123');
	});

	it('writes ZERO secret bytes into the device-local struct / data.json', async () => {
		await service.create({
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_API_KEY=sk-secret-123',
		});
		expect(await dataJsonString()).not.toContain('sk-secret-123');
	});

	it('honours an explicit markSecretKeys entry for a non-auth key', async () => {
		const result = await service.create({
			name: 'marked',
			scope: 'shared',
			envText: 'MY_TOKENISH=plain-but-secret',
			markSecretKeys: ['MY_TOKENISH'],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.envEntries[0].value.kind).toBe('secretRef');
		expect(await dataJsonString()).not.toContain('plain-but-secret');
	});

	it('drops an invalid context-limit entry but still saves the snippet (TEST-SS-067, EC-SS-12)', async () => {
		const result = await service.create({
			name: 'limits',
			envText: 'FOO=bar',
			contextLimits: { sonnet: 200000, broken: 5 },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.contextLimits).toEqual({ sonnet: 200000 });
	});
});

describe('EnvSnippetService.edit — reconcile secret slots (TEST-SS-061)', () => {
	it('preserves the id and removes a secret slot no longer present', async () => {
		const created = await service.create({
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_API_KEY=sk-1',
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const id = created.value.id;
		const ref = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		expect(ports.secretStore.getStoredKeys()).toContain(ref);

		const edited = await service.edit(id, {
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_BASE_URL=https://api',
		});
		expect(edited.ok && edited.value.id).toBe(id);
		// The now-absent secret slot was deleted.
		expect(ports.secretStore.getStoredKeys()).not.toContain(ref);
	});
});

describe('EnvSnippetService.remove — delete both stores (TEST-SS-062, EC-SS-6)', () => {
	it('drops the struct and the secret slot, and is idempotent', async () => {
		const created = await service.create({
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_API_KEY=sk-1',
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const id = created.value.id;
		const ref = envSecretKey('provider:codex', 'OPENAI_API_KEY');

		const removed = await service.remove(id);
		expect(removed.ok).toBe(true);
		expect(ports.secretStore.getStoredKeys()).not.toContain(ref);
		const list = await service.list();
		expect(list.ok && list.value).toEqual([]);

		// Idempotent — removing a missing id is ok.
		const again = await service.remove(id);
		expect(again.ok).toBe(true);
	});
});

describe('EnvSnippetService.apply — scope inference (TEST-SS-064, EC-SS-14)', () => {
	it('writes the snippet entries into the inferred scope', async () => {
		const created = await service.create({
			name: 'codex-env',
			envText: 'OPENAI_BASE_URL=https://api',
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const applied = await service.apply(created.value.id);
		expect(applied.ok).toBe(true);
		const read = await service.readScope('provider:codex');
		expect(read.ok && read.value.map((e) => e.key)).toContain('OPENAI_BASE_URL');
	});
});

describe('EnvSnippetService.applyScopeText — split + review keys (TEST-SS-052/053)', () => {
	it('routes secret + non-secret values and returns the out-of-scope review keys', async () => {
		const result = await service.applyScopeText(
			'shared',
			'PATH=/usr/bin\nOPENAI_API_KEY=sk-1\nFOO=bar',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// OPENAI_API_KEY (provider:codex) + FOO (shared-unknown) are out of the shared scope.
		expect([...result.value.reviewKeys].sort()).toEqual(['FOO', 'OPENAI_API_KEY']);
		// The secret value never landed in data.json.
		expect(await dataJsonString()).not.toContain('sk-1');
		// The provider-scoped secret slot exists.
		expect(ports.secretStore.getStoredKeys()).toContain(
			envSecretKey('provider:codex', 'OPENAI_API_KEY'),
		);
		// The shared scope holds the non-secret PATH inline.
		const shared = await service.readScope('shared');
		expect(shared.ok && shared.value.find((e) => e.key === 'PATH')?.value.kind).toBe('inline');
	});
});

describe('EnvSnippetService.readScope — masked secretRef (TEST-SS-014)', () => {
	it('returns secretRef entries WITHOUT resolving the value', async () => {
		await service.create({
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_API_KEY=sk-secret-123',
		});
		await service.applyScopeText('provider:codex', 'OPENAI_API_KEY=sk-secret-123');
		const read = await service.readScope('provider:codex');
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		const entry = read.value.find((e) => e.key === 'OPENAI_API_KEY');
		expect(entry?.value.kind).toBe('secretRef');
		expect(JSON.stringify(read.value)).not.toContain('sk-secret-123');
	});
});

describe('EnvSnippetService — Result boundary, no secret substring (TEST-SS-094, EC-SS-13)', () => {
	it('surfaces a store-write failure as err with no secret/env value substring', async () => {
		ports.secretStore.setSecretStoreAvailable(false);
		const result = await service.create({
			name: 'codex-keys',
			scope: 'provider:codex',
			envText: 'OPENAI_API_KEY=sk-secret-123',
		});
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error.message).not.toContain('sk-secret-123');
	});
});

describe('EnvSnippetService — no switch(providerId) (NFR-SS-008)', () => {
	it('the source contains no provider-id branch', () => {
		const raw = readFileSync(
			resolve(process.cwd(), 'src/application/settings/EnvSnippetService.ts'),
			'utf8',
		);
		const code = raw
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^:])\/\/.*$/gm, '$1');
		expect(code).not.toMatch(/switch\s*\(\s*[A-Za-z0-9_.]*provider[A-Za-z0-9_]*\s*\)/i);
		expect(code).not.toMatch(/===\s*['"](claude|codex|opencode)['"]/);
	});
});
