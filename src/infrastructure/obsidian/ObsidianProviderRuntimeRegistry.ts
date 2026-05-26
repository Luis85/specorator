/**
 * The Obsidian runtime registry (P9, SPEC-PV-009) — the widened
 * `createChatRuntime(providerId): Result<ChatRuntimePort>` factory target.
 * Constructs the active provider's `ChatRuntimePort` from a **data-driven builder
 * table** keyed by provider id (no `switch (providerId)` / `if (provider===)` —
 * NFR-PV-014): `'claude'` reuses the P1 `ClaudeCliChatRuntime` UNCHANGED (`ok`,
 * byte-identical P8, SPEC-PV-031); `'codex'` → `CodexRuntime`; `'opencode'` →
 * `OpencodeRuntime`. Each non-Claude runtime owns its transport + reads the key via
 * the `SecretStorePort` at the turn boundary + reads JSONL/ACP history via the
 * `HomeFsPort`.
 *
 * Honest construct gate (SPEC-PV-025): a key-needing provider whose native secret
 * store is unavailable → `Result.err('keyRequired')` before the runtime is handed
 * out; a non-Node/unavailable transport surfaces at turn time as a terminal error
 * chunk (the runtime stays constructible). No throw escapes (NFR-PV-005).
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the MANUAL legs TEST-PV-M1/M2/M3. No `obsidian` symbol leaks past this file.
 */
import type {
	ChatRuntimePort,
	ProviderId,
	LoggerPort,
	SecretStorePort,
	HomeFsPort,
} from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { ClaudeCliChatRuntime } from './ClaudeCliChatRuntime';
import { CodexRuntime } from './CodexRuntime';
import { OpencodeRuntime } from './OpencodeRuntime';

export interface ObsidianRuntimeRegistryDeps {
	readonly secretStore: SecretStorePort;
	readonly homeFs: HomeFsPort;
	readonly cwd?: string | null;
	readonly logger?: LoggerPort;
}

/** A per-provider runtime builder (the data-driven dispatch entry). */
type RuntimeBuilder = (deps: ObsidianRuntimeRegistryDeps) => Result<ChatRuntimePort>;

export class ObsidianProviderRuntimeRegistry {
	/**
	 * The data-driven builder table — one entry per registered provider. Construction
	 * dispatches through a map lookup, never a provider-id branch (NFR-PV-014).
	 */
	private readonly builders: ReadonlyMap<ProviderId, RuntimeBuilder> = new Map<
		ProviderId,
		RuntimeBuilder
	>([
		[
			'claude',
			(deps) => ok(new ClaudeCliChatRuntime(deps.logger, deps.cwd)),
		],
		[
			'codex',
			(deps) => ObsidianProviderRuntimeRegistry._buildKeyed(deps, (d) => new CodexRuntime(d)),
		],
		[
			'opencode',
			(deps) =>
				ObsidianProviderRuntimeRegistry._buildKeyed(deps, (d) => new OpencodeRuntime(d)),
		],
	]);

	constructor(private readonly deps: ObsidianRuntimeRegistryDeps) {}

	/**
	 * Construct the runtime for `providerId` via the builder table. A missing builder
	 * (impossible for the closed union) → `Result.err('unavailable')`.
	 */
	createChatRuntime(providerId: ProviderId): Result<ChatRuntimePort> {
		const builder = this.builders.get(providerId);
		if (builder === undefined) {
			return err(new Error('unavailable'));
		}
		return builder(this.deps);
	}

	/**
	 * Build a key-needing runtime, gating honestly on native secret-store
	 * availability (SPEC-PV-025): no native store → `err('keyRequired')` (the field
	 * is shown/disabled-with-reason, EC-PV-4/10). The actual key value is read async
	 * inside the runtime's turn boundary, never here.
	 */
	private static _buildKeyed(
		deps: ObsidianRuntimeRegistryDeps,
		make: (deps: ObsidianRuntimeRegistryDeps) => ChatRuntimePort,
	): Result<ChatRuntimePort> {
		if (!deps.secretStore.isAvailable()) {
			return err(new Error('keyRequired'));
		}
		return ok(make(deps));
	}
}
