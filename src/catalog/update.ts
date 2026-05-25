import type { AssetMeta, InstalledState } from "./types";

// Returns ids whose bundled (catalog) version differs from the installed version.
export function detectUpdates(installed: InstalledState, catalog: AssetMeta[]): string[] {
  const out: string[] = [];
  for (const a of catalog) {
    const rec = installed[a.id];
    if (rec !== undefined && rec.version !== a.version) out.push(a.id);
  }
  return out;
}
