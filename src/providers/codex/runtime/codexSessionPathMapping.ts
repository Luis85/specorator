import type { CodexLaunchSpec } from './codexLaunchTypes';

/**
 * Host ⇆ target session-path translation. The app-server may run on a different
 * platform/filesystem than the vault host (e.g. WSL, a container), so session
 * file paths are mapped through the launch spec's `pathMapper`. With no launch
 * spec the host and target are the same machine and paths pass through.
 */

export function toHostSessionPath(
  launchSpec: CodexLaunchSpec | null,
  targetPath: string | null | undefined,
): string | null {
  if (!targetPath) {
    return null;
  }
  return launchSpec?.pathMapper.toHostPath(targetPath) ?? targetPath;
}

export function toTargetSessionPath(
  launchSpec: CodexLaunchSpec | null,
  sessionPath: string | null | undefined,
): string | null {
  if (!sessionPath) {
    return null;
  }
  if (!launchSpec) {
    return sessionPath;
  }
  if (launchSpec.target.platformFamily === 'unix' && sessionPath.startsWith('/')) {
    return sessionPath;
  }
  if (
    launchSpec.target.platformFamily === 'windows'
    && (/^[A-Za-z]:[\\/]/.test(sessionPath) || sessionPath.startsWith('\\\\'))
  ) {
    return sessionPath;
  }
  return launchSpec.pathMapper.toTargetPath(sessionPath) ?? sessionPath;
}

export function mapHostPathToTarget(
  launchSpec: CodexLaunchSpec | null,
  hostPath: string | null | undefined,
): string | null {
  if (!hostPath) {
    return null;
  }
  return launchSpec?.pathMapper.toTargetPath(hostPath) ?? hostPath;
}

export function mapRequiredHostPathsToTarget(
  launchSpec: CodexLaunchSpec | null,
  hostPaths: string[],
  label: string,
): string[] {
  if (!launchSpec) {
    return hostPaths;
  }
  return hostPaths.map((hostPath) => {
    const targetPath = launchSpec.pathMapper.toTargetPath(hostPath);
    if (!targetPath) {
      throw new Error(`Codex cannot access ${label} from the selected target: ${hostPath}`);
    }
    return targetPath;
  });
}
