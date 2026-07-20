import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ChatRuntimeQueryOptions } from '../../../core/runtime/types';
import { extractCursorModeValue, resolveCursorFamilyId } from './cursorModelFamily';
import { fromCursorModelValue } from './cursorModelId';

// Pure model-selection resolution for the Cursor ACP runtime, extracted from
// CursorChatRuntime. The per-turn override wins over the persisted setting, and
// a family-only pick resolves against the ACTIVE endpoint's catalog.

/** The turn's model override, else the persisted cursor `model` setting, else null. */
export function resolveActiveCursorModel(
  queryOptions: ChatRuntimeQueryOptions | undefined,
  settings: Record<string, unknown>,
): string | null {
  if (typeof queryOptions?.model === 'string' && queryOptions.model.trim()) {
    return queryOptions.model.trim();
  }
  const snapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot(settings, 'cursor');
  return typeof snapshot.model === 'string' && snapshot.model.trim() ? snapshot.model.trim() : null;
}

/**
 * Resolves an active model selection to a concrete catalog id: an explicit
 * variant is kept as-is, a family-only pick resolves against the active catalog.
 */
export function resolveCursorSessionModelId(
  activeModel: string | null | undefined,
  catalogIds: string[],
): string | undefined {
  if (!activeModel) {
    return undefined;
  }
  const rawId = fromCursorModelValue(activeModel);
  return extractCursorModeValue(rawId, catalogIds) ? rawId : resolveCursorFamilyId(rawId, catalogIds);
}
