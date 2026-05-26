/**
 * Providers domain barrel (P9, SPEC-PV-002/003). One-stop import for the frozen
 * descriptor table + the pure resolve helpers. Pure data + pure functions only —
 * no `obsidian`/`node:*`/Vue (ADR-001).
 */
export type { ProviderCapabilities, ProviderDescriptor } from './ProviderDescriptor';
export {
	CLAUDE_DESCRIPTOR,
	CODEX_DESCRIPTOR,
	OPENCODE_DESCRIPTOR,
	PROVIDER_DESCRIPTORS,
	DEFAULT_CHAT_PROVIDER_ID,
} from './ProviderDescriptor';
export {
	listEnabledProviders,
	resolveActiveProvider,
	resolveProviderForModel,
} from './resolveProvider';
