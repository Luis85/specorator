// The Cursor CLI on Windows is typically an npm-style `.cmd` shim. Windows refuses
// to spawn `.cmd`/`.bat` batch files without a shell (Node's CVE-2024-27980 fix),
// so those are wrapped through cmd.exe.
//
// The implementation was promoted to `utils/windowsSpawn.resolveBatchAwareSpawnSpec`
// when the OpenCode ACP launch needed identical treatment; these aliases keep
// Cursor's call sites and vocabulary intact.

import { type BatchAwareSpawnSpec, resolveBatchAwareSpawnSpec } from '../../../utils/windowsSpawn';

export type CursorSpawnSpec = BatchAwareSpawnSpec;

export const resolveCursorSpawnSpec = resolveBatchAwareSpawnSpec;
