/**
 * T-PV-004 (TEST-PV-020/021/022/023) — RED: the frozen `ProviderDescriptor` +
 * `ProviderCapabilities` matrix data (SPEC-PV-002/022). Asserts the capability bag
 * shape, the three frozen descriptors per the full SPEC-PV-022 truth table (BACKED
 * vs GATED-OFF per flag), the `Object.freeze` invariant (TEST-PV-020), the distinct
 * `blankTabOrder` (10/15/20), the `isEnabled` predicate (claude always true,
 * non-claude reads `enabledProviders` membership, default `[]` → disabled), the
 * pure `ownsModel` prefix predicate, `PROVIDER_DESCRIPTORS` = the three, and
 * `DEFAULT_CHAT_PROVIDER_ID === 'claude'`. All predicates pure + total (never throw).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` + the runtime assertions until T-PV-005
 * adds `src/domain/chat/providers/ProviderDescriptor.ts`.
 *
 * Traces: TEST-PV-020/021/022/023, SPEC-PV-002, SPEC-PV-022,
 * REQ-PV-001/020/021/022/023/103, NFR-PV-014.
 */
import { describe, it, expect } from 'vitest';
import {
	CLAUDE_DESCRIPTOR,
	CODEX_DESCRIPTOR,
	OPENCODE_DESCRIPTOR,
	PROVIDER_DESCRIPTORS,
	DEFAULT_CHAT_PROVIDER_ID,
	type ProviderCapabilities,
	type ProviderDescriptor,
} from '@/domain/chat/providers/ProviderDescriptor';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The capability bag exposes EXACTLY the SPEC-PV-002 flags ----
const _capKeys: Equals<
	keyof ProviderCapabilities,
	| 'providerId'
	| 'supportsPersistentRuntime'
	| 'supportsNativeHistory'
	| 'supportsPlanMode'
	| 'supportsRewind'
	| 'supportsFork'
	| 'supportsProviderCommands'
	| 'supportsImageAttachments'
	| 'supportsInstructionMode'
	| 'supportsMcpTools'
	| 'supportsTurnSteer'
	| 'reasoningControl'
	| 'needsApiKey'
	| 'readsHomeDir'
> = true;
void _capKeys;

// ---- The descriptor exposes the SPEC-PV-002 members + the P10-additive
// `environmentKeyPatterns?` (SPEC-SS-002). The field is OPTIONAL — the P9
// matrix assertions stay green (additive only). ----
const _descKeys: Equals<
	keyof ProviderDescriptor,
	| 'id'
	| 'displayNameKey'
	| 'blankTabOrder'
	| 'capabilities'
	| 'isEnabled'
	| 'ownsModel'
	| 'environmentKeyPatterns'
> = true;
void _descKeys;

const _envPatterns: Equals<
	ProviderDescriptor['environmentKeyPatterns'],
	readonly RegExp[] | undefined
> = true;
void _envPatterns;

const withEnabled = (...ids: PluginSettings['enabledProviders']): PluginSettings => ({
	...DEFAULT_SETTINGS,
	enabledProviders: ids,
});

describe('ProviderDescriptor — the frozen matrix (TEST-PV-020/021/022/023)', () => {
	it('DEFAULT_CHAT_PROVIDER_ID is "claude"', () => {
		expect(DEFAULT_CHAT_PROVIDER_ID).toBe('claude');
	});

	it('PROVIDER_DESCRIPTORS lists exactly the three descriptors', () => {
		expect(PROVIDER_DESCRIPTORS.map((d) => d.id).sort()).toEqual(['claude', 'codex', 'opencode']);
		expect(PROVIDER_DESCRIPTORS).toContain(CLAUDE_DESCRIPTOR);
		expect(PROVIDER_DESCRIPTORS).toContain(CODEX_DESCRIPTOR);
		expect(PROVIDER_DESCRIPTORS).toContain(OPENCODE_DESCRIPTOR);
	});

	it('blankTabOrder is distinct: opencode 10, codex 15, claude 20 (REQ-PV-002)', () => {
		expect(OPENCODE_DESCRIPTOR.blankTabOrder).toBe(10);
		expect(CODEX_DESCRIPTOR.blankTabOrder).toBe(15);
		expect(CLAUDE_DESCRIPTOR.blankTabOrder).toBe(20);
	});

	it('CLAUDE_DESCRIPTOR: all-true caps, turn-steer false, no key, no home-dir (TEST-PV-021)', () => {
		const c = CLAUDE_DESCRIPTOR.capabilities;
		expect(c.providerId).toBe('claude');
		expect(c.supportsPersistentRuntime).toBe(true);
		expect(c.supportsNativeHistory).toBe(true);
		expect(c.supportsPlanMode).toBe(true);
		expect(c.supportsRewind).toBe(true);
		expect(c.supportsFork).toBe(true);
		expect(c.supportsProviderCommands).toBe(true);
		expect(c.supportsImageAttachments).toBe(true);
		expect(c.supportsInstructionMode).toBe(true);
		expect(c.supportsMcpTools).toBe(true);
		expect(c.supportsTurnSteer).toBe(false);
		expect(c.reasoningControl).toBe('effort');
		expect(c.needsApiKey).toBe(false);
		expect(c.readsHomeDir).toBe(false);
	});

	it('CODEX_DESCRIPTOR: rewind/commands/MCP off, steer/fork on, needs key + home (TEST-PV-022)', () => {
		const c = CODEX_DESCRIPTOR.capabilities;
		expect(c.providerId).toBe('codex');
		expect(c.supportsPersistentRuntime).toBe(true);
		expect(c.supportsNativeHistory).toBe(true);
		expect(c.supportsPlanMode).toBe(true);
		expect(c.supportsRewind).toBe(false);
		expect(c.supportsFork).toBe(true);
		expect(c.supportsProviderCommands).toBe(false);
		expect(c.supportsImageAttachments).toBe(true);
		expect(c.supportsInstructionMode).toBe(true);
		expect(c.supportsMcpTools).toBe(false);
		expect(c.supportsTurnSteer).toBe(true);
		expect(c.reasoningControl).toBe('effort');
		expect(c.needsApiKey).toBe(true);
		expect(c.readsHomeDir).toBe(true);
	});

	it('OPENCODE_DESCRIPTOR: rewind/fork/steer/MCP off, commands on, needs key + home (TEST-PV-023)', () => {
		const c = OPENCODE_DESCRIPTOR.capabilities;
		expect(c.providerId).toBe('opencode');
		expect(c.supportsPersistentRuntime).toBe(true);
		expect(c.supportsNativeHistory).toBe(true);
		expect(c.supportsPlanMode).toBe(true);
		expect(c.supportsRewind).toBe(false);
		expect(c.supportsFork).toBe(false);
		expect(c.supportsProviderCommands).toBe(true);
		expect(c.supportsImageAttachments).toBe(true);
		expect(c.supportsInstructionMode).toBe(true);
		expect(c.supportsMcpTools).toBe(false);
		expect(c.supportsTurnSteer).toBe(false);
		expect(c.reasoningControl).toBe('effort');
		expect(c.needsApiKey).toBe(true);
		expect(c.readsHomeDir).toBe(true);
	});

	it('each descriptor + its capabilities is frozen (TEST-PV-020, REQ-PV-020)', () => {
		for (const d of [CLAUDE_DESCRIPTOR, CODEX_DESCRIPTOR, OPENCODE_DESCRIPTOR]) {
			expect(Object.isFrozen(d)).toBe(true);
			expect(Object.isFrozen(d.capabilities)).toBe(true);
		}
		expect(Object.isFrozen(PROVIDER_DESCRIPTORS)).toBe(true);
	});

	it('isEnabled(CLAUDE) is always true regardless of settings (REQ-PV-003/103)', () => {
		expect(CLAUDE_DESCRIPTOR.isEnabled(DEFAULT_SETTINGS)).toBe(true);
		expect(CLAUDE_DESCRIPTOR.isEnabled(withEnabled())).toBe(true);
		expect(CLAUDE_DESCRIPTOR.isEnabled(withEnabled('codex'))).toBe(true);
	});

	it('non-Claude isEnabled reads enabledProviders membership; default [] → disabled (REQ-PV-103)', () => {
		expect(CODEX_DESCRIPTOR.isEnabled(DEFAULT_SETTINGS)).toBe(false);
		expect(OPENCODE_DESCRIPTOR.isEnabled(DEFAULT_SETTINGS)).toBe(false);
		expect(CODEX_DESCRIPTOR.isEnabled(withEnabled('codex'))).toBe(true);
		expect(CODEX_DESCRIPTOR.isEnabled(withEnabled('opencode'))).toBe(false);
		expect(OPENCODE_DESCRIPTOR.isEnabled(withEnabled('opencode', 'codex'))).toBe(true);
	});

	it('ownsModel is a pure prefix/membership predicate; an unowned model → all false (REQ-PV-061)', () => {
		// An obviously unowned model is owned by none.
		const unowned = 'totally-not-a-real-model-xyz';
		expect(CLAUDE_DESCRIPTOR.ownsModel(unowned)).toBe(false);
		expect(CODEX_DESCRIPTOR.ownsModel(unowned)).toBe(false);
		expect(OPENCODE_DESCRIPTOR.ownsModel(unowned)).toBe(false);
		// At most one descriptor owns any given model id (disjoint namespaces).
		const ownersOf = (m: string) =>
			[CLAUDE_DESCRIPTOR, CODEX_DESCRIPTOR, OPENCODE_DESCRIPTOR].filter((d) => d.ownsModel(m));
		expect(ownersOf(unowned)).toHaveLength(0);
	});

	it('predicates are total — never throw on odd input', () => {
		const odd = { ...DEFAULT_SETTINGS, enabledProviders: [] };
		expect(() => CLAUDE_DESCRIPTOR.isEnabled(odd)).not.toThrow();
		expect(() => CODEX_DESCRIPTOR.ownsModel('')).not.toThrow();
		expect(() => OPENCODE_DESCRIPTOR.ownsModel('anything')).not.toThrow();
	});
});

describe('ProviderDescriptor.environmentKeyPatterns — the P10-additive field (TEST-SS-051, SPEC-SS-002)', () => {
	it('CLAUDE carries the pinned [^ANTHROPIC_, ^CLAUDE_] patterns (case-insensitive)', () => {
		const patterns = CLAUDE_DESCRIPTOR.environmentKeyPatterns ?? [];
		expect(patterns.map((p) => p.source)).toEqual(['^ANTHROPIC_', '^CLAUDE_']);
		expect(patterns.every((p) => p.flags.includes('i'))).toBe(true);
		expect(patterns.some((p) => p.test('ANTHROPIC_API_KEY'))).toBe(true);
		expect(patterns.some((p) => p.test('CLAUDE_CODE_FOO'))).toBe(true);
	});

	it('CODEX carries the pinned [^OPENAI_, ^CODEX_] patterns', () => {
		const patterns = CODEX_DESCRIPTOR.environmentKeyPatterns ?? [];
		expect(patterns.map((p) => p.source)).toEqual(['^OPENAI_', '^CODEX_']);
		expect(patterns.some((p) => p.test('OPENAI_API_KEY'))).toBe(true);
		expect(patterns.some((p) => p.test('CODEX_HOME'))).toBe(true);
	});

	it('OPENCODE carries the pinned [^OPENCODE_] pattern', () => {
		const patterns = OPENCODE_DESCRIPTOR.environmentKeyPatterns ?? [];
		expect(patterns.map((p) => p.source)).toEqual(['^OPENCODE_']);
		expect(patterns.some((p) => p.test('OPENCODE_API_KEY'))).toBe(true);
	});
});
