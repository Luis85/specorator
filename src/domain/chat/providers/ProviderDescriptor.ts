/**
 * Provider descriptors + the frozen per-provider capability matrix (SPEC-PV-002,
 * SPEC-PV-022). Regrown 1:1 from claudian `core/providers/types.ts` +
 * `providers/{claude,codex,opencode}/capabilities.ts` (the frozen flags) + each
 * provider's `chatUIConfig.ownsModel`. Pure data + pure predicates, `readonly`,
 * frozen — no class, no `obsidian`/`node:*`/Vue (ADR-001).
 *
 * **BACKED vs GATED-OFF (charter §6a, NG1):** the dev wires the BACKED capabilities
 * per the frozen matrix and sets the GATED-OFF flags to literal `false` — no
 * rewind/provider-commands/MCP is built for Codex; no rewind/fork/steer/MCP for
 * Opencode. The false flag hides/disables the affordance through the EXISTING
 * capability-gated view-model; nothing extra is built (REQ-PV-034/043).
 *
 * **No `switch (providerId)`** anywhere downstream — consumers gate on the
 * capability bag, never the id (NFR-PV-014, SPEC-PV-029).
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { PluginSettings } from '@/domain/settings/PluginSettings';

/**
 * The frozen per-provider capability bag (parity claudian `ProviderCapabilities`).
 * Read through the registry as plain data; NEVER branched on by `providerId`
 * (REQ-PV-013/020, NFR-PV-014).
 */
export interface ProviderCapabilities {
	readonly providerId: ProviderId;
	readonly supportsPersistentRuntime: boolean;
	readonly supportsNativeHistory: boolean;
	readonly supportsPlanMode: boolean;
	/** GATED OFF for codex + opencode (REQ-PV-022/023). */
	readonly supportsRewind: boolean;
	/** GATED OFF for opencode (REQ-PV-023). */
	readonly supportsFork: boolean;
	/** GATED OFF for codex (REQ-PV-022). */
	readonly supportsProviderCommands: boolean;
	readonly supportsImageAttachments: boolean;
	readonly supportsInstructionMode: boolean;
	/** GATED OFF for codex + opencode (REQ-PV-022/023, NG3). */
	readonly supportsMcpTools: boolean;
	/** BACKED for codex; false for claude + opencode (REQ-PV-022/023). */
	readonly supportsTurnSteer: boolean;
	/** 'effort' for all three providers in P9. */
	readonly reasoningControl: 'effort' | 'token-budget' | 'none';
	/** Whether the provider needs a secret (API key) before a turn can start (REQ-PV-072/100). */
	readonly needsApiKey: boolean;
	/** Whether the provider reads beyond-vault home-dir transcripts (gates the consent gate, REQ-PV-082). */
	readonly readsHomeDir: boolean;
}

/** A registered provider = identity + ordering + the frozen bag + the pure enable/own predicates. */
export interface ProviderDescriptor {
	readonly id: ProviderId;
	/** The i18n key resolving the display name; the stable fallback (parity `displayName`). */
	readonly displayNameKey: string;
	/** Lower renders first in the chooser (parity `blankTabOrder`: opencode 10, codex 15, claude 20). */
	readonly blankTabOrder: number;
	readonly capabilities: ProviderCapabilities;
	/** PURE: whether the provider is enabled given the settings (claude is ALWAYS enabled, REQ-PV-003). Total. */
	isEnabled(settings: PluginSettings): boolean;
	/** PURE: whether this provider owns the given model id (parity `ownsModel`, REQ-PV-060). Total. */
	ownsModel(model: string): boolean;
}

/** The default + unknown/disabled fallback provider (SPEC-PV-001/002/003). */
export const DEFAULT_CHAT_PROVIDER_ID: ProviderId = 'claude';

// ── ownsModel predicates (pure prefix/membership over the BACKED model namespaces) ──
// Disjoint namespaces (parity claudian): claude = the fixed short model ids; codex =
// the gpt-/o<digit> families; opencode = the `opencode:` prefix. An unowned model
// matches none → the resolve falls back (REQ-PV-061).

const CLAUDE_MODEL_IDS: readonly string[] = ['haiku', 'sonnet', 'sonnet[1m]', 'opus', 'opus[1m]'];
const CODEX_MODEL_RE = /^(gpt-|o\d)/i;
const OPENCODE_MODEL_PREFIX = 'opencode:';

function claudeOwnsModel(model: string): boolean {
	return CLAUDE_MODEL_IDS.includes(model);
}

function codexOwnsModel(model: string): boolean {
	return CODEX_MODEL_RE.test(model);
}

function opencodeOwnsModel(model: string): boolean {
	return model.startsWith(OPENCODE_MODEL_PREFIX);
}

/** Claude is always enabled (the complete default; its membership is implicit, REQ-PV-003). */
function claudeIsEnabled(_settings: PluginSettings): boolean {
	return true;
}

/** A non-Claude provider is enabled iff the user listed it in `enabledProviders` (REQ-PV-103). */
function nonClaudeIsEnabled(id: ProviderId, settings: PluginSettings): boolean {
	return settings.enabledProviders.includes(id);
}

export const CLAUDE_DESCRIPTOR: ProviderDescriptor = Object.freeze({
	id: 'claude',
	displayNameKey: 'agent.chat.providers.name.claude',
	blankTabOrder: 20,
	capabilities: Object.freeze({
		providerId: 'claude',
		supportsPersistentRuntime: true,
		supportsNativeHistory: true,
		supportsPlanMode: true,
		supportsRewind: true,
		supportsFork: true,
		supportsProviderCommands: true,
		supportsImageAttachments: true,
		supportsInstructionMode: true,
		supportsMcpTools: true,
		supportsTurnSteer: false,
		reasoningControl: 'effort',
		needsApiKey: false,
		readsHomeDir: false,
	}),
	isEnabled: claudeIsEnabled,
	ownsModel: claudeOwnsModel,
});

export const CODEX_DESCRIPTOR: ProviderDescriptor = Object.freeze({
	id: 'codex',
	displayNameKey: 'agent.chat.providers.name.codex',
	blankTabOrder: 15,
	capabilities: Object.freeze({
		providerId: 'codex',
		supportsPersistentRuntime: true,
		supportsNativeHistory: true,
		supportsPlanMode: true,
		supportsRewind: false,
		supportsFork: true,
		supportsProviderCommands: false,
		supportsImageAttachments: true,
		supportsInstructionMode: true,
		supportsMcpTools: false,
		supportsTurnSteer: true,
		reasoningControl: 'effort',
		needsApiKey: true,
		readsHomeDir: true,
	}),
	isEnabled: (settings: PluginSettings) => nonClaudeIsEnabled('codex', settings),
	ownsModel: codexOwnsModel,
});

export const OPENCODE_DESCRIPTOR: ProviderDescriptor = Object.freeze({
	id: 'opencode',
	displayNameKey: 'agent.chat.providers.name.opencode',
	blankTabOrder: 10,
	capabilities: Object.freeze({
		providerId: 'opencode',
		supportsPersistentRuntime: true,
		supportsNativeHistory: true,
		supportsPlanMode: true,
		supportsRewind: false,
		supportsFork: false,
		supportsProviderCommands: true,
		supportsImageAttachments: true,
		supportsInstructionMode: true,
		supportsMcpTools: false,
		supportsTurnSteer: false,
		reasoningControl: 'effort',
		needsApiKey: true,
		readsHomeDir: true,
	}),
	isEnabled: (settings: PluginSettings) => nonClaudeIsEnabled('opencode', settings),
	ownsModel: opencodeOwnsModel,
});

/** The frozen registered-provider table (SPEC-PV-002). The single source of capability truth. */
export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = Object.freeze([
	CLAUDE_DESCRIPTOR,
	CODEX_DESCRIPTOR,
	OPENCODE_DESCRIPTOR,
]);
