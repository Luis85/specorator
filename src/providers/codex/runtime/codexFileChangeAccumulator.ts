import { asRecord, firstString } from './codexNotificationHelpers';

/**
 * Normalization + accumulation for Codex `file_change` items. A single file
 * change can arrive incrementally (started → patch-updated → completed), so the
 * accumulator memoizes the merged input per item id and merges later deltas in.
 * All merge/normalize logic is pure; only `CodexFileChangeAccumulator` holds
 * state, and that state is private to file-change routing.
 */

export function buildFileChangeInput(changes: unknown): Record<string, unknown> {
  return { changes: normalizeFileChanges(changes) };
}

export function formatFileChangeSummary(change: unknown): string {
  const record = asRecord(change);
  const path = firstString(record?.path);
  if (!record || !path) {
    return '';
  }

  const kind = firstString(record.kind, record.type) || 'change';
  return `${kind}: ${path}`;
}

function mergeApplyPatchInputs(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (!previous) {
    return next;
  }

  const patch = typeof next.patch === 'string'
    ? next.patch
    : typeof previous.patch === 'string'
      ? previous.patch
      : undefined;
  const changes = mergeFileChanges(previous.changes, next.changes);
  return {
    ...previous,
    ...next,
    ...(patch ? { patch } : {}),
    ...(changes.length > 0 ? { changes } : {}),
  };
}

function normalizeFileChanges(changes: unknown): Record<string, unknown>[] {
  if (!Array.isArray(changes)) {
    return [];
  }

  return changes
    .map(normalizeFileChange)
    .filter((change): change is Record<string, unknown> => change !== null);
}

function normalizeFileChange(change: unknown): Record<string, unknown> | null {
  const record = asRecord(change);
  const path = firstString(record?.path);
  if (!record || !path) {
    return null;
  }

  const kindInfo = normalizeFileChangeKind(record.kind ?? record.type);
  const diff = firstString(record.diff);
  return {
    ...record,
    path,
    kind: kindInfo.kind,
    type: kindInfo.kind,
    ...(kindInfo.movePath ? { movePath: kindInfo.movePath } : {}),
    ...(diff ? { diff } : {}),
  };
}

function normalizeFileChangeKind(value: unknown): { kind: string; movePath?: string } {
  if (typeof value === 'string' && value) {
    return { kind: value };
  }

  const record = asRecord(value);
  const kind = firstString(record?.type) || 'change';
  const movePath = firstString(record?.move_path);
  return {
    kind,
    ...(movePath ? { movePath } : {}),
  };
}

function mergeFileChanges(previous: unknown, next: unknown): Record<string, unknown>[] {
  const previousChanges = normalizeFileChanges(previous);
  const nextChanges = normalizeFileChanges(next);
  if (previousChanges.length === 0) return nextChanges;
  if (nextChanges.length === 0) return previousChanges;

  const merged = new Map<string, Record<string, unknown>>();
  for (const change of previousChanges) {
    merged.set(fileChangeKey(change), change);
  }
  for (const change of nextChanges) {
    const key = fileChangeKey(change);
    const previousChange = merged.get(key);
    merged.set(key, previousChange ? mergeFileChange(previousChange, change) : change);
  }
  return [...merged.values()];
}

function mergeFileChange(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...previous,
    ...next,
    ...(typeof next.diff === 'string'
      ? { diff: next.diff }
      : typeof previous.diff === 'string'
        ? { diff: previous.diff }
        : {}),
  };
}

function fileChangeKey(change: Record<string, unknown>): string {
  return `${firstString(change.path)}\0${firstString(change.movePath)}`;
}

export class CodexFileChangeAccumulator {
  private byId = new Map<string, Record<string, unknown>>();

  /** Merges `input` into the memoized input for `itemId` and returns the result. */
  remember(itemId: string, input: Record<string, unknown>): Record<string, unknown> {
    const previous = this.byId.get(itemId);
    const merged = mergeApplyPatchInputs(previous, input);
    this.byId.set(itemId, merged);
    return merged;
  }

  reset(): void {
    this.byId.clear();
  }
}
