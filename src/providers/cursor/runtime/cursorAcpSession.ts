import type { CursorPermissionMode } from './cursorLaunchArgs';

export interface CursorAcpModeResolution {
  modeId: 'agent' | 'plan';
  autoApprove: boolean;
}

/**
 * Cursor ACP exposes agent/plan/ask session modes. Chat turns never use `ask`
 * (that is the aux runner's read-only posture); yolo keeps agent mode and
 * auto-answers permission requests instead of engaging --force-style flags.
 */
export function resolveCursorAcpMode(permissionMode: CursorPermissionMode): CursorAcpModeResolution {
  if (permissionMode === 'plan') {
    return { modeId: 'plan', autoApprove: false };
  }
  return { modeId: 'agent', autoApprove: permissionMode === 'yolo' };
}
