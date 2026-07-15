import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import { CURSOR_MODEL_CATALOG_TTL_MS } from './cursorModelCatalog';

const SESSION_MODEL_STATE_PATH = '.specorator/cursor-advertised-models.json';
const SCHEMA_VERSION = 3;
const writeTails = new WeakMap<VaultFileAdapter, Promise<void>>();

export interface CursorSessionModelSnapshot {
  configId: string;
  values: string[];
}

interface PersistedSessionModelState extends CursorSessionModelSnapshot {
  v: typeof SCHEMA_VERSION;
  cliKey: string;
  fetchedAt: number;
}

export async function loadCursorSessionModelState(
  adapter: VaultFileAdapter,
  cliKey: string,
): Promise<CursorSessionModelSnapshot | null> {
  if (!(await adapter.exists(SESSION_MODEL_STATE_PATH))) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await adapter.read(SESSION_MODEL_STATE_PATH));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const candidate = parsed as Partial<PersistedSessionModelState>;
  if (
    candidate.v !== SCHEMA_VERSION
    || typeof candidate.cliKey !== 'string'
    || candidate.cliKey !== cliKey
    || typeof candidate.fetchedAt !== 'number'
    || Date.now() - candidate.fetchedAt > CURSOR_MODEL_CATALOG_TTL_MS
    || typeof candidate.configId !== 'string'
    || candidate.configId.trim().length === 0
    || !Array.isArray(candidate.values)
  ) {
    return null;
  }
  const values = candidate.values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return {
    configId: candidate.configId,
    values,
  };
}

export async function saveCursorSessionModelState(
  adapter: VaultFileAdapter,
  cliKey: string,
  state: CursorSessionModelSnapshot,
): Promise<void> {
  const payload: PersistedSessionModelState = {
    v: SCHEMA_VERSION,
    cliKey,
    configId: state.configId,
    fetchedAt: Date.now(),
    values: state.values,
  };
  const previous = writeTails.get(adapter) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(() => adapter.write(SESSION_MODEL_STATE_PATH, JSON.stringify(payload)));
  writeTails.set(adapter, write);
  try {
    await write;
  } finally {
    if (writeTails.get(adapter) === write) {
      writeTails.delete(adapter);
    }
  }
}
