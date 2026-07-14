import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import { buildCursorModelCatalogCliKey } from './cursorModelCatalog';

// Persists the Cursor-advertised model wire ids (the bracket variants a
// session/new response carries) so a cold resume — where session/load advertises
// none — can still match a user's model change on the first turn. Staleness is
// safe: a value the current CLI no longer accepts simply fails to match and the
// update is skipped, and any live session/new overwrites this with fresh values.
const ADVERTISED_MODELS_PATH = '.specorator/cursor-advertised-models.json';
const SCHEMA_VERSION = 2;

interface PersistedAdvertisedModelsV2 {
  v: typeof SCHEMA_VERSION;
  cliKey: string;
  fetchedAt: number;
  values: string[];
}

/** Loads the persisted advertised catalog for the active CLI identity, or null. */
export async function loadCursorAdvertisedModels(
  adapter: VaultFileAdapter,
  cliKey: string,
): Promise<string[] | null> {
  if (!(await adapter.exists(ADVERTISED_MODELS_PATH))) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await adapter.read(ADVERTISED_MODELS_PATH));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const candidate = parsed as Partial<PersistedAdvertisedModelsV2>;
  if (
    candidate.v !== SCHEMA_VERSION
    || typeof candidate.cliKey !== 'string'
    || candidate.cliKey !== cliKey
    || !Array.isArray(candidate.values)
  ) {
    return null;
  }
  const values = candidate.values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return values.length > 0 ? values : null;
}

/** Persists a non-empty advertised catalog scoped to the resolved CLI identity. */
export async function saveCursorAdvertisedModels(
  adapter: VaultFileAdapter,
  cliKey: string,
  values: string[],
): Promise<void> {
  if (values.length === 0) {
    return;
  }
  const payload: PersistedAdvertisedModelsV2 = {
    v: SCHEMA_VERSION,
    cliKey,
    fetchedAt: Date.now(),
    values,
  };
  await adapter.write(ADVERTISED_MODELS_PATH, JSON.stringify(payload));
}

export { buildCursorModelCatalogCliKey };
