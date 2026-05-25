import { ok, err, type Result } from '@/domain/shared/Result';
import { HistoryError, type ProviderHistoryPort } from '@/domain/ports/ProviderHistoryPort';
import type { VaultPort, LoggerPort } from '@/domain/ports';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	ConversationRecord,
	ConversationMeta,
	ForkPlan,
	ClaudeProviderState,
} from '@/domain/chat/ConversationRecord';
import { serialise, deserialise } from '@/infrastructure/history/conversationRecordCodec';
import { buildForkPlan } from '@/infrastructure/history/buildForkPlan';
import { resolveSessionsFolder } from '@/domain/settings/PluginSettings';
import { tryAsync } from '@/domain/shared/tryAsync';

/**
 * Production vault-file `ProviderHistoryPort` (SPEC-TS-006, ADR-TS-001 §1/§3).
 * One JSON file per conversation at `<resolveSessionsFolder(sessionsFolder)>/<id>.json`.
 * Mirrors claudian-main's `ClaudeHistoryStore` (file-backed) +
 * `ClaudeConversationHistoryService`.
 *
 * Lives under `src/infrastructure/obsidian/**` → coverage-excluded (NFR-TS-011);
 * its behavioural gate is the **manual** leg TEST-TS-M1. The folder-resolve /
 * (de)serialise / truncate / fork-derive *logic* is factored into the pure
 * `conversationRecordCodec` (T-TS-008) + `buildForkPlan` helper (T-TS-008), which
 * carry the unit weight. All I/O is through its own `VaultPort`; the codec never
 * throws across the store boundary (corrupt → err{corrupt}, missing → err{not-found}).
 */
export class VaultFileHistoryStore implements ProviderHistoryPort {
	readonly providerId: ProviderId = 'claude';

	constructor(
		private readonly vault: VaultPort,
		private readonly getSessionsFolder: () => Promise<string>,
		private readonly logger?: LoggerPort,
	) {}

	async listSessions(): Promise<Result<ConversationMeta[]>> {
		const folder = await this._folder();
		const listed = await tryAsync(() => this.vault.listFiles(folder));
		// An absent/missing folder → ok([]) (load-or-default, NFR-TS-014).
		if (!listed.ok) return ok([]);

		const metas: ConversationMeta[] = [];
		for (const path of listed.value.filter((p) => p.endsWith('.json'))) {
			const read = await tryAsync(() => this.vault.readFile(path));
			if (!read.ok) continue;
			const parsed = deserialise(read.value);
			if (!parsed.ok) {
				// A corrupt file is skipped (logged), never aborts the list (EC-TS-6).
				this.logger?.warn('history.skip_corrupt_session', { path });
				continue;
			}
			metas.push(parsed.record.meta);
		}
		metas.sort((a, b) => b.updatedAt - a.updatedAt);
		return ok(metas);
	}

	async hydrate(conversationId: string): Promise<Result<ConversationRecord>> {
		const path = await this._path(conversationId);
		const read = await tryAsync(() => this.vault.readFile(path));
		if (!read.ok) {
			return err(new HistoryError('not-found', `conversation not found: ${conversationId}`));
		}
		const parsed = deserialise(read.value);
		if (!parsed.ok) {
			return err(new HistoryError('corrupt', `conversation unparseable: ${conversationId}`));
		}
		return ok(parsed.record);
	}

	async save(record: ConversationRecord): Promise<Result<void>> {
		const folder = await this._folder();
		const created = await tryAsync(() => this.vault.createFolder(folder));
		if (!created.ok) return err(new HistoryError('io', `failed to create folder: ${folder}`));
		const path = `${folder}/${record.meta.id}.json`;
		const written = await tryAsync(() => this.vault.writeFile(path, serialise(record)));
		if (!written.ok) return err(new HistoryError('io', `failed to write: ${path}`));
		return ok(undefined);
	}

	async updateMeta(
		conversationId: string,
		patch: Partial<ConversationMeta>,
	): Promise<Result<void>> {
		const hydrated = await this.hydrate(conversationId);
		if (!hydrated.ok) return err(hydrated.error);
		// Merge meta only — messages/providerState/version untouched (EC-TS-14).
		const next: ConversationRecord = {
			...hydrated.value,
			meta: { ...hydrated.value.meta, ...patch, id: hydrated.value.meta.id },
		};
		return this.save(next);
	}

	async delete(conversationId: string): Promise<Result<void>> {
		const path = await this._path(conversationId);
		// Idempotent — a missing file deletes to ok.
		const deleted = await tryAsync(() => this.vault.deleteFile(path));
		if (!deleted.ok) return err(new HistoryError('io', `failed to delete: ${path}`));
		return ok(undefined);
	}

	async resolveSessionId(conversationId: string): Promise<Result<string | null>> {
		const hydrated = await this.hydrate(conversationId);
		// Missing/corrupt → ok(null) (load-or-default, EC-TS-5).
		if (!hydrated.ok) return ok(null);
		const state = hydrated.value.providerState as ClaudeProviderState;
		return ok(hydrated.value.meta.sessionId ?? state.forkSource?.sessionId ?? null);
	}

	async buildForkPlan(
		sourceConversationId: string,
		resumeAtMessageId: string,
	): Promise<Result<ForkPlan>> {
		const hydrated = await this.hydrate(sourceConversationId);
		if (!hydrated.ok) return err(hydrated.error);
		// Pure derive — source untouched (EC-TS-7).
		return buildForkPlan(hydrated.value, resumeAtMessageId);
	}

	private async _folder(): Promise<string> {
		return resolveSessionsFolder(await this.getSessionsFolder());
	}

	private async _path(conversationId: string): Promise<string> {
		return `${await this._folder()}/${conversationId}.json`;
	}
}
