/**
 * Barrel for the env-snippet domain subsystem (SPEC-SS-002..004). Pure data +
 * pure functions — no `obsidian`/`node:*`/Vue (ADR-001).
 */
export {
	parseEnvironmentVariables,
	serializeEnvEntries,
	parseContextLimit,
	MIN_CONTEXT_LIMIT,
	MAX_CONTEXT_LIMIT,
	type EnvEntry,
	type EnvironmentScope,
	type EnvSnippetStruct,
} from './EnvSnippet';
export {
	SHARED_ENVIRONMENT_KEYS,
	classifyEnvKey,
	isSecretEnvKey,
	type EnvKeyOwnership,
} from './classifyEnvKey';
export {
	getEnvironmentReviewKeysForScope,
	inferEnvironmentSnippetScope,
	resolveEnvironmentSnippetScope,
	getEnvironmentScopeUpdates,
	type EnvironmentScopeUpdate,
} from './envScope';
