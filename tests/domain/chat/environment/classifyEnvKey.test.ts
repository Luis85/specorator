/**
 * T-SS-008 (TEST-SS-051 classifier leg) — RED: the 13-key `SHARED_ENVIRONMENT_KEYS`
 * (regrown verbatim from `providerEnvironment.ts:23-37`), the PURE descriptor-driven
 * `classifyEnvKey` (shared-known / provider-pattern / shared-unknown — NO
 * `switch(providerId)`), and the PURE `isSecretEnvKey` (provider-owned auth-suffix
 * OR markSecret). Both total — never throw.
 *
 * Fails until T-SS-009 adds `src/domain/chat/environment/classifyEnvKey.ts`.
 *
 * Traces: TEST-SS-051, SPEC-SS-002, REQ-SS-051/066, NFR-SS-008, EC-SS-3.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
	SHARED_ENVIRONMENT_KEYS,
	classifyEnvKey,
	isSecretEnvKey,
	type EnvKeyOwnership,
} from '@/domain/chat/environment/classifyEnvKey';
import { PROVIDER_DESCRIPTORS } from '@/domain/chat/providers/ProviderDescriptor';

const descriptors = PROVIDER_DESCRIPTORS;

describe('SHARED_ENVIRONMENT_KEYS (verbatim, SPEC-SS-002)', () => {
	it('is the 13-key set regrown from providerEnvironment.ts:23-37', () => {
		expect([...SHARED_ENVIRONMENT_KEYS].sort()).toEqual(
			[
				'PATH',
				'HTTP_PROXY',
				'HTTPS_PROXY',
				'NO_PROXY',
				'ALL_PROXY',
				'SSL_CERT_FILE',
				'SSL_CERT_DIR',
				'REQUESTS_CA_BUNDLE',
				'CURL_CA_BUNDLE',
				'NODE_EXTRA_CA_CERTS',
				'TMPDIR',
				'TMP',
				'TEMP',
			].sort(),
		);
		expect(SHARED_ENVIRONMENT_KEYS.size).toBe(13);
	});
});

describe('classifyEnvKey (descriptor-driven, SPEC-SS-002, EC-SS-3)', () => {
	it('classifies a shared-known key', () => {
		expect(classifyEnvKey('PATH', descriptors)).toEqual({ type: 'shared-known' });
		expect(classifyEnvKey('  path  ', descriptors)).toEqual({ type: 'shared-known' }); // trim + upper-case
	});

	it('classifies a provider-owned key via the descriptor patterns', () => {
		expect(classifyEnvKey('ANTHROPIC_API_KEY', descriptors)).toEqual({
			type: 'provider',
			providerId: 'claude',
		});
		expect(classifyEnvKey('OPENAI_BASE_URL', descriptors)).toEqual({
			type: 'provider',
			providerId: 'codex',
		});
		expect(classifyEnvKey('OPENCODE_API_KEY', descriptors)).toEqual({
			type: 'provider',
			providerId: 'opencode',
		});
	});

	it('classifies an unknown key as shared-unknown', () => {
		expect(classifyEnvKey('FOO', descriptors)).toEqual({ type: 'shared-unknown' });
	});

	it('classifies an empty/whitespace key as shared-unknown', () => {
		expect(classifyEnvKey('', descriptors)).toEqual({ type: 'shared-unknown' });
		expect(classifyEnvKey('   ', descriptors)).toEqual({ type: 'shared-unknown' });
	});

	it('is total — never throws (empty descriptor list)', () => {
		expect(() => classifyEnvKey('FOO', [])).not.toThrow();
		expect(classifyEnvKey('ANTHROPIC_API_KEY', [])).toEqual({ type: 'shared-unknown' });
	});
});

describe('isSecretEnvKey (auth-suffix + markSecret, SPEC-SS-002, REQ-SS-066)', () => {
	const providerOwned: EnvKeyOwnership = { type: 'provider', providerId: 'claude' };
	const sharedKnown: EnvKeyOwnership = { type: 'shared-known' };

	it('is true for a provider-owned auth-suffixed key', () => {
		expect(isSecretEnvKey('ANTHROPIC_API_KEY', providerOwned, false)).toBe(true);
		expect(isSecretEnvKey('CLAUDE_AUTH_TOKEN', providerOwned, false)).toBe(true);
		expect(isSecretEnvKey('SOME_TOKEN', providerOwned, false)).toBe(true);
	});

	it('is false for a provider-owned non-auth key', () => {
		expect(isSecretEnvKey('OPENAI_BASE_URL', { type: 'provider', providerId: 'codex' }, false)).toBe(false);
	});

	it('is false for a shared key even with an auth suffix (not provider-owned)', () => {
		expect(isSecretEnvKey('SOME_API_KEY', sharedKnown, false)).toBe(false);
	});

	it('is true whenever markSecret is true (user-marked)', () => {
		expect(isSecretEnvKey('OPENAI_BASE_URL', { type: 'provider', providerId: 'codex' }, true)).toBe(true);
		expect(isSecretEnvKey('FOO', { type: 'shared-unknown' }, true)).toBe(true);
	});

	it('is total — never throws', () => {
		expect(() => isSecretEnvKey('', { type: 'shared-unknown' }, false)).not.toThrow();
	});
});

describe('no switch(providerId) guard (NFR-SS-008)', () => {
	it('the classifier module contains no provider-id branch', () => {
		const src = readFileSync(
			fileURLToPath(new URL('../../../../src/domain/chat/environment/classifyEnvKey.ts', import.meta.url)),
			'utf8',
		);
		expect(src).not.toMatch(/switch\s*\(\s*provider/i);
		expect(src).not.toMatch(/===\s*['"](claude|codex|opencode)['"]/);
	});
});
