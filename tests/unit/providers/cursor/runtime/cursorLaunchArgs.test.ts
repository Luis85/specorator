import {
  buildCursorAgentJsonModeFlagArgs,
  buildCursorAgentTextModeFlagArgs,
  resolveCursorSandboxMode,
} from '@/providers/cursor/runtime/cursorLaunchArgs';

describe('cursorLaunchArgs', () => {
  const workspace = '/vault';

  it('builds json argv with trust and sandbox for normal mode', () => {
    const args = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'normal',
      resumeSessionId: null,
    });
    expect(args).toContain('-p');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('--workspace');
    expect(args).toContain(workspace);
    expect(args).toContain('--trust');
    expect(args).toContain('--sandbox');
    expect(args).toContain(resolveCursorSandboxMode());
  });

  it('adds force and disabled sandbox for yolo', () => {
    const args = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'yolo',
    });
    expect(args).toContain('--force');
    expect(args).toContain('disabled');
  });

  it('adds plan mode for plan permission', () => {
    const args = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'plan',
    });
    expect(args).toContain('--mode');
    expect(args).toContain('plan');
  });

  it('uses disabled sandbox on Windows for normal and plan modes', () => {
    expect(resolveCursorSandboxMode('win32')).toBe('disabled');
    const normal = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'normal',
      platform: 'win32',
    });
    expect(normal).toContain('--sandbox');
    expect(normal).toContain('disabled');
    expect(normal).not.toContain('enabled');

    const plan = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'plan',
      platform: 'win32',
    });
    expect(plan).toContain('--mode');
    expect(plan).toContain('plan');
    expect(plan).toContain('--sandbox');
    expect(plan).toContain('disabled');
  });

  it('uses enabled sandbox on macOS and Linux for normal and plan modes', () => {
    expect(resolveCursorSandboxMode('darwin')).toBe('enabled');
    expect(resolveCursorSandboxMode('linux')).toBe('enabled');

    const normal = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'normal',
      platform: 'darwin',
    });
    expect(normal).toContain('--sandbox');
    expect(normal).toContain('enabled');
  });

  it('appends resume and model when provided', () => {
    const args = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'normal',
      model: 'composer-2-fast',
      resumeSessionId: 'sess-1',
    });
    expect(args).toContain('--resume');
    expect(args).toContain('sess-1');
    expect(args).toContain('--model');
    expect(args).toContain('composer-2-fast');
  });

  it('text mode omits MCP approval even when requested', () => {
    const args = buildCursorAgentTextModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'normal',
      approveMcps: true,
    });
    expect(args).toContain('--output-format');
    expect(args).toContain('text');
    expect(args).not.toContain('--approve-mcps');
  });

  it('read-only json mode forces ask mode and never escalates to force/disabled sandbox', () => {
    // Even when the surrounding chat is in yolo, a read-only aux query must
    // stay read-only: ask mode, no --force, no disabled sandbox on mac/linux.
    const args = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'yolo',
      readOnly: true,
      platform: 'darwin',
    });
    expect(args).toContain('--mode');
    expect(args).toContain('ask');
    expect(args).not.toContain('--force');
    expect(args).toContain('--sandbox');
    expect(args).toContain('enabled');
    expect(args).not.toContain('disabled');
    expect(args).not.toContain('plan');
  });

  it('read-only json mode uses allowlist sandbox on Windows', () => {
    const args = buildCursorAgentJsonModeFlagArgs({
      workspaceDir: workspace,
      permissionMode: 'plan',
      readOnly: true,
      platform: 'win32',
    });
    expect(args).toContain('--mode');
    expect(args).toContain('ask');
    expect(args).toContain('--sandbox');
    expect(args).toContain('disabled');
    expect(args).not.toContain('--force');
  });
});
