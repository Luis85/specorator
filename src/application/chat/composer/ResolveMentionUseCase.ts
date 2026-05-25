import { type Result } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { MentionDataProviderPort, MentionReferent } from '@/domain/ports';

/**
 * ResolveMentionUseCase (SPEC-CP-014, REQ-CP-009/010/012/013). Wraps the
 * `MentionDataProviderPort` query in a `Result` (ADR-004). The port is best-effort
 * (its only failure mode is "no results" = `[]`), so a normal empty source yields
 * `ok([])` (load-or-default, REQ-CP-012); `err` arises ONLY when the underlying
 * read throws an irrecoverable fault (mapped via `tryAsync`, never crossing the
 * boundary). The resolved insertion is the referent's `mentionText` (REQ-CP-013) —
 * a file mention inserts the token only; the removable chip is P5 (NG1). Debounce +
 * request-guard live in the consumer (SPEC-CP-018). No provider branch; no
 * `obsidian`/`node:*`/Vue import.
 */
export class ResolveMentionUseCase {
	constructor(private readonly mentions: MentionDataProviderPort) {}

	query(filter: string, signal?: AbortSignal): Promise<Result<MentionReferent[]>> {
		return tryAsync(() => this.mentions.query(filter, signal));
	}
}
