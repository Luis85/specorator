/**
 * RED → green unit tests for `buildSettingsViewModel` (SPEC-SS-006/007,
 * T-SS-014/015). Drives the section ordering + the per-provider capability-gated
 * control visibility + the Claude-only additivity baseline + the 14-member
 * `SettingsControl` union shape (no secret value carried; read-only members carry
 * no write `onChange`) over the shared `ProviderRegistry` + a scripted catalog +
 * a definition predicate.
 *
 * TEST-SS-001/002/004/005/007/010/011/015/020/022/080/081/082/083/093.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	buildSettingsViewModel,
	type SettingsControl,
	type SettingsSection,
} from '@/application/settings/buildSettingsViewModel';
import { ProviderRegistry } from '@/infrastructure/providers/ProviderRegistry';
import { providerSecretKey } from '@/domain/ports/SecretStorePort';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';

const registry = new ProviderRegistry();

const CLAUDE_CATALOG: ToolbarCatalog = {
	models: [
		{ id: 'sonnet', label: 'Sonnet' },
		{ id: 'opus', label: 'Opus' },
	],
	defaultModelId: 'sonnet',
};
const EMPTY_CATALOG: ToolbarCatalog = { models: [] };

function makeInput(overrides: Partial<Parameters<typeof buildSettingsViewModel>[0]> = {}) {
	return {
		settings: DEFAULT_SETTINGS,
		registry,
		getCatalog: (_id: ProviderId): ToolbarCatalog => CLAUDE_CATALOG,
		secretKeysSet: new Set<string>(),
		secretStorageAvailable: true,
		hasProviderDefinitions: (_id: ProviderId) => ({ slash: false, skill: false, agent: false }),
		...overrides,
	};
}

function sectionKeys(sections: readonly SettingsSection[]): readonly string[] {
	return sections.map((section) => section.key);
}

function controlsOf(sections: readonly SettingsSection[], key: string): readonly SettingsControl[] {
	return sections.find((section) => section.key === key)?.controls ?? [];
}

function kindsOf(controls: readonly SettingsControl[]): readonly string[] {
	return controls.map((control) => control.kind);
}

describe('buildSettingsViewModel — section ordering (TEST-SS-001/004/005)', () => {
	it('leads with the shared section, then enabled providers in blank-tab order, then environment', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex', 'opencode'] };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		// opencode 10 < codex 15 < claude 20 → opencode, codex, claude.
		expect(sectionKeys(vm.sections)).toEqual([
			'shared',
			'provider:opencode',
			'provider:codex',
			'provider:claude',
			'environment',
		]);
	});

	it('shared section leads with the P0 core fields, then permissionMode + keyboardNav (TEST-SS-005)', () => {
		const vm = buildSettingsViewModel(makeInput());
		const shared = controlsOf(vm.sections, 'shared');
		expect(kindsOf(shared)).toEqual(['coreField', 'coreField', 'permissionMode', 'keyboardNav']);
		const core = shared.filter((control) => control.kind === 'coreField');
		expect(core.map((c) => c.fieldKey)).toEqual(['locale', 'logLevel']);
	});

	it('Claude is always present with NO providerToggle (TEST-SS-004)', () => {
		const vm = buildSettingsViewModel(makeInput());
		const claude = controlsOf(vm.sections, 'provider:claude');
		expect(kindsOf(claude)).not.toContain('providerToggle');
	});

	it('a non-Claude section leads with a providerToggle (TEST-SS-003)', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		const codex = controlsOf(vm.sections, 'provider:codex');
		expect(codex[0]?.kind).toBe('providerToggle');
	});

	it('the environment section carries shared + per-enabled-provider envScopeEditor + envSnippetList (TEST-SS-050)', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		const env = controlsOf(vm.sections, 'environment');
		const editors = env.filter((c) => c.kind === 'envScopeEditor');
		const scopes = editors.map((c) => c.scope);
		// shared + the per-enabled-provider editors in blank-tab order (codex 15 <
		// claude 20), then the snippet list.
		expect(scopes).toEqual(['shared', 'provider:codex', 'provider:claude']);
		expect(kindsOf(env)).toContain('envSnippetList');
	});
});

describe('buildSettingsViewModel — determinism (TEST-SS-002)', () => {
	it('produces the same serialisable structure for the same input', () => {
		const a = buildSettingsViewModel(makeInput());
		const b = buildSettingsViewModel(makeInput());
		expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
	});
});

describe('buildSettingsViewModel — apiKeyField tri-state (TEST-SS-011/015)', () => {
	it('omits apiKeyField for Claude (needsApiKey:false)', () => {
		const vm = buildSettingsViewModel(makeInput());
		expect(kindsOf(controlsOf(vm.sections, 'provider:claude'))).not.toContain('apiKeyField');
	});

	it('emits apiKeyField unset for a needs-key provider with no stored key', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		const field = controlsOf(vm.sections, 'provider:codex').find((c) => c.kind === 'apiKeyField');
		expect(field?.kind).toBe('apiKeyField');
		expect(field?.kind === 'apiKeyField' && field.state).toBe('unset');
	});

	it('emits apiKeyField set when the secret key is present', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(
			makeInput({ settings, secretKeysSet: new Set([providerSecretKey('codex')]) }),
		);
		const field = controlsOf(vm.sections, 'provider:codex').find((c) => c.kind === 'apiKeyField');
		expect(field?.kind === 'apiKeyField' && field.state).toBe('set');
	});

	it('emits apiKeyField unavailable when secret storage is unavailable (TEST-SS-015, EC-SS-8)', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(makeInput({ settings, secretStorageAvailable: false }));
		const field = controlsOf(vm.sections, 'provider:codex').find((c) => c.kind === 'apiKeyField');
		expect(field?.kind === 'apiKeyField' && field.state).toBe('unavailable');
	});
});

describe('buildSettingsViewModel — modelPicker (TEST-SS-020/022, EC-SS-10)', () => {
	it('emits a modelPicker per provider preselecting the catalog default', () => {
		const vm = buildSettingsViewModel(makeInput());
		const picker = controlsOf(vm.sections, 'provider:claude').find((c) => c.kind === 'modelPicker');
		expect(picker?.kind).toBe('modelPicker');
		expect(picker?.kind === 'modelPicker' && picker.selectedId).toBe('sonnet');
		expect(picker?.kind === 'modelPicker' && picker.empty).toBe(false);
	});

	it('preselects the persisted providerDefaultModel over the catalog default (TEST-SS-021)', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, providerDefaultModel: { claude: 'opus' } };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		const picker = controlsOf(vm.sections, 'provider:claude').find((c) => c.kind === 'modelPicker');
		expect(picker?.kind === 'modelPicker' && picker.selectedId).toBe('opus');
	});

	it('flags empty:true when the catalog has no models (EC-SS-10)', () => {
		const vm = buildSettingsViewModel(makeInput({ getCatalog: () => EMPTY_CATALOG }));
		const picker = controlsOf(vm.sections, 'provider:claude').find((c) => c.kind === 'modelPicker');
		expect(picker?.kind === 'modelPicker' && picker.empty).toBe(true);
	});
});

describe('buildSettingsViewModel — MCP manager vs doc-note (TEST-SS-080/081, EC-SS-2)', () => {
	it('emits mcpManager for a supportsMcpTools provider (Claude)', () => {
		const vm = buildSettingsViewModel(makeInput());
		const claude = kindsOf(controlsOf(vm.sections, 'provider:claude'));
		expect(claude).toContain('mcpManager');
		expect(claude).not.toContain('mcpDocNote');
	});

	it('emits mcpDocNote for a non-supportsMcpTools provider (Codex)', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		const codex = kindsOf(controlsOf(vm.sections, 'provider:codex'));
		expect(codex).toContain('mcpDocNote');
		expect(codex).not.toContain('mcpManager');
	});
});

describe('buildSettingsViewModel — slash / agent lists (TEST-SS-031/040, EC-SS-9)', () => {
	it('emits slashList only when supportsProviderCommands AND a slash definition exists', () => {
		const withSlash = buildSettingsViewModel(
			makeInput({ hasProviderDefinitions: () => ({ slash: true, skill: false, agent: false }) }),
		);
		expect(kindsOf(controlsOf(withSlash.sections, 'provider:claude'))).toContain('slashList');

		const withoutDef = buildSettingsViewModel(makeInput());
		expect(kindsOf(controlsOf(withoutDef.sections, 'provider:claude'))).not.toContain('slashList');
	});

	it('omits slashList for a provider that does not support provider commands (Codex)', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(
			makeInput({ settings, hasProviderDefinitions: () => ({ slash: true, skill: false, agent: false }) }),
		);
		expect(kindsOf(controlsOf(vm.sections, 'provider:codex'))).not.toContain('slashList');
	});

	it('emits agentList when either agent or skill definitions exist, omits it otherwise (REQ-SS-031)', () => {
		const withSkill = buildSettingsViewModel(
			makeInput({ hasProviderDefinitions: () => ({ slash: false, skill: true, agent: false }) }),
		);
		expect(kindsOf(controlsOf(withSkill.sections, 'provider:claude'))).toContain('agentList');

		const none = buildSettingsViewModel(makeInput());
		expect(kindsOf(controlsOf(none.sections, 'provider:claude'))).not.toContain('agentList');
	});
});

describe('buildSettingsViewModel — approvals + permission mode (TEST-SS-082/083)', () => {
	it('renders approvalRules unconditionally in the Claude section', () => {
		const vm = buildSettingsViewModel(makeInput());
		expect(kindsOf(controlsOf(vm.sections, 'provider:claude'))).toContain('approvalRules');
	});

	it('reflects the persisted defaultPermissionMode in the shared permissionMode control', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, defaultPermissionMode: 'plan' };
		const vm = buildSettingsViewModel(makeInput({ settings }));
		const mode = controlsOf(vm.sections, 'shared').find((c) => c.kind === 'permissionMode');
		expect(mode?.kind === 'permissionMode' && mode.value).toBe('plan');
	});

	it('defaults the permissionMode control to normal when unset', () => {
		const vm = buildSettingsViewModel(makeInput());
		const mode = controlsOf(vm.sections, 'shared').find((c) => c.kind === 'permissionMode');
		expect(mode?.kind === 'permissionMode' && mode.value).toBe('normal');
	});
});

describe('buildSettingsViewModel — Claude-only additivity baseline (TEST-SS-093, EC-SS-1)', () => {
	it('renders [shared, provider:claude, environment] with no toggle, no key field, MCP present', () => {
		const vm = buildSettingsViewModel(makeInput());
		expect(sectionKeys(vm.sections)).toEqual(['shared', 'provider:claude', 'environment']);
		const claude = kindsOf(controlsOf(vm.sections, 'provider:claude'));
		expect(claude).not.toContain('providerToggle');
		expect(claude).not.toContain('apiKeyField');
		expect(claude).toContain('mcpManager');
		expect(claude).toContain('modelPicker');
	});
});

describe('buildSettingsViewModel — union invariants (TEST-SS-007/014/041, EC-SS-9)', () => {
	it('carries no secret value on any control; apiKeyField carries only a tri-state', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(
			makeInput({ settings, secretKeysSet: new Set([providerSecretKey('codex')]) }),
		);
		const serialised = JSON.stringify(vm);
		// No control may carry a key value; only the tri-state literal is allowed.
		expect(serialised).not.toContain('secretRef');
		const field = controlsOf(vm.sections, 'provider:codex').find((c) => c.kind === 'apiKeyField');
		expect(field?.kind === 'apiKeyField' && Object.keys(field)).toEqual(['kind', 'providerId', 'state']);
	});

	it('read-only members (agentList/slashList/mcpDocNote) expose no onChange / no write handle', () => {
		const settings: PluginSettings = { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] };
		const vm = buildSettingsViewModel(
			makeInput({
				settings,
				hasProviderDefinitions: () => ({ slash: true, skill: true, agent: false }),
			}),
		);
		const all = vm.sections.flatMap((section) => section.controls);
		for (const control of all) {
			if (control.kind === 'agentList' || control.kind === 'slashList' || control.kind === 'mcpDocNote') {
				expect('onChange' in control).toBe(false);
			}
		}
	});
});

describe('buildSettingsViewModel — no switch(providerId) (TEST-SS-010, NFR-SS-008)', () => {
	it('the source contains no provider-id branch', () => {
		const raw = readFileSync(
			resolve(process.cwd(), 'src/application/settings/buildSettingsViewModel.ts'),
			'utf8',
		);
		// Strip line + block comments so a doc note referencing the rule is ignored.
		const code = raw
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^:])\/\/.*$/gm, '$1');
		expect(code).not.toMatch(/switch\s*\(\s*[A-Za-z0-9_.]*provider[A-Za-z0-9_]*\s*\)/i);
		expect(code).not.toMatch(/===\s*['"](claude|codex|opencode)['"]/);
	});
});
