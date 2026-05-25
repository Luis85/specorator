import type { FileSystem, InstalledState, InstalledRecord } from "./types";

export const SIDECAR_PATH = ".specorator/installed.json";

export async function loadState(fs: FileSystem): Promise<InstalledState> {
  const raw = await fs.read(SIDECAR_PATH);
  if (!raw) return {};
  try { return JSON.parse(raw) as InstalledState; }
  catch { return {}; }
}

async function persist(fs: FileSystem, state: InstalledState): Promise<void> {
  await fs.mkdirp(".specorator");
  await fs.write(SIDECAR_PATH, JSON.stringify(state, null, 2));
}

export async function saveRecord(fs: FileSystem, id: string, rec: InstalledRecord): Promise<void> {
  const state = await loadState(fs);
  state[id] = rec;
  await persist(fs, state);
}

export async function removeRecord(fs: FileSystem, id: string): Promise<void> {
  const state = await loadState(fs);
  delete state[id];
  await persist(fs, state);
}
