/**
 * T-SS-012 (TEST-SS-052/053/064) — RED: the PURE scope routing (regrown 1:1 from
 * claudian `providerEnvironment.ts:273-364`, throw-paths converted to total
 * returns): getEnvironmentReviewKeysForScope, inferEnvironmentSnippetScope,
 * resolveEnvironmentSnippetScope, getEnvironmentScopeUpdates — all reusing
 * classifyEnvKey so the routing is branch-free (NFR-SS-008).
 *
 * Fails until T-SS-013 adds `src/domain/chat/environment/envScope.ts`.
 *
 * Traces: TEST-SS-052, TEST-SS-053, TEST-SS-064, SPEC-SS-004,
 * REQ-SS-050/052/053/064, NFR-SS-008, EC-SS-4/14.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	getEnvironmentReviewKeysForScope,
	inferEnvironmentSnippetScope,
	resolveEnvironmentSnippetScope,
	getEnvironmentScopeUpdates,
	type EnvironmentScopeUpdate,
} from '@/domain/chat/environment/envScope';
import { PROVIDER_DESCRIPTORS } from '@/domain/chat/providers/ProviderDescriptor';

const descriptors = PROVIDER_DESCRIPTORS;

describe('getEnvironmentReviewKeysForScope (TEST-SS-052)', () => {
	it('shared scope → any non-shared-known key is a review key', () => {
		const keys = getEnvironmentReviewKeysForScope('PATH=/x\nFOO=bar\nANTHROPIC_API_KEY=z', 'shared', descriptors);
		expect(keys).toContain('FOO');
		expect(keys).toContain('ANTHROPIC_API_KEY');
		expect(keys).not.toContain('PATH');
	});

	it('provider scope → any key not owned by THAT provider is a review key', () => {
		const keys = getEnvironmentReviewKeysForScope(
			'ANTHROPIC_API_KEY=z\nOPENAI_API_KEY=y\nFOO=bar',
			'provider:claude',
			descriptors,
		);
		expect(keys).not.toContain('ANTHROPIC_API_KEY');
		expect(keys).toContain('OPENAI_API_KEY');
		expect(keys).toContain('FOO');
	});

	it('is total — never throws', () => {
		expect(() => getEnvironmentReviewKeysForScope('', 'shared', descriptors)).not.toThrow();
	});
});

describe('inferEnvironmentSnippetScope (TEST-SS-064)', () => {
	it('returns the single scope all keys belong to', () => {
		expect(inferEnvironmentSnippetScope('ANTHROPIC_API_KEY=z\nCLAUDE_CODE_FOO=1', descriptors)).toBe(
			'provider:claude',
		);
		expect(inferEnvironmentSnippetScope('PATH=/x\nHTTP_PROXY=y', descriptors)).toBe('shared');
	});

	it('returns undefined when keys span multiple scopes', () => {
		expect(inferEnvironmentSnippetScope('ANTHROPIC_API_KEY=z\nOPENAI_API_KEY=y', descriptors)).toBeUndefined();
	});

	it('returns undefined for empty/comment-only content', () => {
		expect(inferEnvironmentSnippetScope('# just a comment\n\n', descriptors)).toBeUndefined();
	});
});

describe('resolveEnvironmentSnippetScope (TEST-SS-064, EC-SS-14)', () => {
	it('returns the inferred scope when present', () => {
		expect(resolveEnvironmentSnippetScope('PATH=/x', descriptors, 'provider:codex')).toBe('shared');
	});

	it('returns fallbackScope only when there is no meaningful content', () => {
		expect(resolveEnvironmentSnippetScope('# comment\n', descriptors, 'provider:codex')).toBe('provider:codex');
		expect(resolveEnvironmentSnippetScope('', descriptors)).toBeUndefined();
	});

	it('returns undefined when content spans scopes (not the fallback)', () => {
		expect(
			resolveEnvironmentSnippetScope('ANTHROPIC_API_KEY=z\nOPENAI_API_KEY=y', descriptors, 'shared'),
		).toBeUndefined();
	});
});

describe('getEnvironmentScopeUpdates (TEST-SS-053, EC-SS-4)', () => {
	it('splits a pasted blob across scopes by key ownership', () => {
		const updates = getEnvironmentScopeUpdates(
			'PATH=/x\nANTHROPIC_API_KEY=z\nOPENAI_API_KEY=y',
			descriptors,
		);
		const byScope = new Map(updates.map((u: EnvironmentScopeUpdate) => [u.scope, u.envText]));
		expect(byScope.get('shared')).toContain('PATH=/x');
		expect(byScope.get('provider:claude')).toContain('ANTHROPIC_API_KEY=z');
		expect(byScope.get('provider:codex')).toContain('OPENAI_API_KEY=y');
	});

	it('attaches a pending comment/blank decorator to the next keyed line scope', () => {
		const updates = getEnvironmentScopeUpdates('# a note\nANTHROPIC_API_KEY=z', descriptors);
		const claude = updates.find((u) => u.scope === 'provider:claude');
		expect(claude?.envText).toContain('# a note');
		expect(claude?.envText).toContain('ANTHROPIC_API_KEY=z');
	});

	it('returns a fallback bucket only when nothing classified', () => {
		expect(getEnvironmentScopeUpdates('', descriptors, 'provider:codex')).toEqual([]);
		const withContent = getEnvironmentScopeUpdates('FOO=bar', descriptors, 'provider:codex');
		// FOO is shared-unknown → it routes to the shared scope (classified), not the fallback bucket.
		expect(withContent.some((u) => u.scope === 'shared')).toBe(true);
	});

	it('is total — never throws', () => {
		expect(() => getEnvironmentScopeUpdates('garbage', descriptors)).not.toThrow();
	});
});

describe('no switch(providerId) guard (NFR-SS-008)', () => {
	it('the envScope module reuses the classifier — no provider-id branch', () => {
		const src = readFileSync(
			resolve(__dirname, '../../../../src/domain/chat/environment/envScope.ts'),
			'utf8',
		);
		expect(src).not.toMatch(/switch\s*\(\s*\w*[Pp]rovider/);
		expect(src).not.toMatch(/===\s*['"](claude|codex|opencode)['"]/);
	});
});
