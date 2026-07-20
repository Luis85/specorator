import * as path from 'node:path';

import { SPECORATOR_STORAGE_PATH } from '../../../core/bootstrap/StoragePaths';
import type { PluginContext } from '../../../core/types/PluginContext';
import { asSettingsBag } from '../../../core/types/settings';
import { getVaultPath } from '../../../utils/path';
import { getCursorProviderSettings } from '../settings';
import { CursorAcpCaptureWriter } from './CursorAcpCaptureWriter';

/**
 * Owns the default-off ACP diagnostics writer for one CursorChatRuntime: builds
 * it per spawn, reconciles it live on a `captureAcpTraffic` toggle without a
 * respawn, fans wire/stderr/lifecycle events into it, and flushes + drops it at
 * teardown. Extracted from CursorChatRuntime; behavior-preserving. The runtime's
 * spawn hooks call `stderr`/`wireFrame` on every frame — cheap no-ops when
 * capture is off — so a mid-session toggle takes effect from the next frame.
 */
export class CursorAcpCaptureSink {
  private writer: CursorAcpCaptureWriter | null = null;
  // Unique per runtime instance so capture dirs never collide across restarts.
  private readonly instanceId =
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private sequence = 0;

  constructor(private readonly plugin: PluginContext) {}

  /** Builds a fresh writer for a new spawn (null when capture is off/headless). */
  build(cliPath: string): void {
    this.writer = this.buildWriter(cliPath);
  }

  /**
   * Flips capture live on a mid-session `captureAcpTraffic` toggle without a
   * respawn: builds the writer when newly enabled, flushes + drops it when newly
   * disabled (so capture stops recording prompt-bearing frames immediately, not
   * at the next unrelated restart). No-op when the writer already matches.
   */
  async reconcile(cliPath: string): Promise<void> {
    const { captureAcpTraffic } = getCursorProviderSettings(asSettingsBag(this.plugin.settings));
    if (captureAcpTraffic && !this.writer) {
      this.writer = this.buildWriter(cliPath);
    } else if (!captureAcpTraffic && this.writer) {
      await this.writer.flush();
      this.writer = null;
    }
  }

  event(kind: string, data: Record<string, unknown> = {}): void {
    this.writer?.event(kind, data);
  }

  stderr(chunk: string): void {
    this.writer?.stderr(chunk);
  }

  wireFrame(direction: 'client' | 'agent', rawLine: string): void {
    this.writer?.wireFrame(direction, rawLine);
  }

  /** Flushes and drops the writer; safe to call when there is no active writer. */
  async flush(): Promise<void> {
    if (this.writer) {
      await this.writer.flush();
      this.writer = null;
    }
  }

  // Diagnostics only — default off. Returns null when the setting is off or the
  // vault path is unavailable (headless/test contexts). Never throws: writer
  // construction failures self-disable via onDisabled, per CursorAcpCaptureWriter.
  private buildWriter(cliPath: string): CursorAcpCaptureWriter | null {
    const { captureAcpTraffic } = getCursorProviderSettings(asSettingsBag(this.plugin.settings));
    if (!captureAcpTraffic) {
      return null;
    }
    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) {
      return null;
    }
    const baseDir = path.join(vaultPath, SPECORATOR_STORAGE_PATH, 'captures', 'cursor');
    return new CursorAcpCaptureWriter({
      baseDir,
      sessionName: `${this.instanceId}-${++this.sequence}-${buildCaptureSessionName()}`,
      meta: {
        // No cheap `cursor-agent --version` probe exists at spawn time; the
        // CLI path is the fallback identity signal for the session.
        cliVersion: cliPath,
        pluginVersion: this.plugin.manifest?.version ?? '0.0.0',
        platform: process.platform,
        startedAt: new Date().toISOString(),
      },
      onDisabled: (error) => {
        this.plugin.logger.scope('cursor.capture').warn('ACP capture disabled after a write failure', error);
      },
    });
  }
}

function buildCaptureSessionName(): string {
  const now = new Date();
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${stamp}-${process.pid}`;
}
