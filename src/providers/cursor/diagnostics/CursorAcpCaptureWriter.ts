import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { redactJsonLine, redactSerializable, scrubString } from '../../../core/logging/redact';

const MAX_CAPTURE_SESSIONS = 20;

export interface CursorAcpCaptureWriterOptions {
  /** `<vault>/.specorator/captures/cursor` — parent directory holding one subdir per session. */
  baseDir: string;
  /** Session-level metadata (cliVersion, pluginVersion, platform, startedAt, ...) persisted to meta.json. */
  meta: Record<string, unknown>;
  /** Single warn hook; called at most once, the first time the writer disables itself. */
  onDisabled?: (error: unknown) => void;
  /** Override for tests; default `${timestamp}-${pid}`. */
  sessionName?: string;
}

/**
 * Per-process capture sink for Cursor ACP diagnostics. Every line is scrubbed
 * with the logger's value-level redactor before it reaches disk; any I/O
 * failure permanently disables the writer for this session — instrumentation
 * must never break a turn.
 */
export class CursorAcpCaptureWriter {
  readonly sessionDir: string;
  readonly ready: Promise<void>;
  disabled = false;
  private queue: Promise<void>;

  constructor(private readonly options: CursorAcpCaptureWriterOptions) {
    const name = options.sessionName ?? buildSessionName();
    this.sessionDir = path.join(options.baseDir, name);
    this.ready = this.initialize();
    this.queue = this.ready;
  }

  wireFrame(dir: 'client' | 'agent', rawLine: string): void {
    this.append('wire.jsonl', JSON.stringify({ t: Date.now(), dir, frame: redactJsonLine(rawLine) }));
  }

  event(kind: string, data: Record<string, unknown> = {}): void {
    this.append(
      'lifecycle.jsonl',
      JSON.stringify({ t: Date.now(), kind, ...(redactSerializable(data) as Record<string, unknown>) }),
    );
  }

  stderr(chunk: string): void {
    this.appendRaw('stderr.log', scrubString(chunk));
  }

  flush(): Promise<void> {
    return this.queue.catch(() => {});
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      await fs.writeFile(
        path.join(this.sessionDir, 'meta.json'),
        `${JSON.stringify(this.options.meta, null, 2)}\n`,
        'utf8',
      );
      await pruneOldSessions(this.options.baseDir, MAX_CAPTURE_SESSIONS);
    } catch (error) {
      this.disable(error);
    }
  }

  private append(file: string, line: string): void {
    this.appendRaw(file, `${scrubString(line)}\n`);
  }

  private appendRaw(file: string, text: string): void {
    if (this.disabled) return;
    this.queue = this.queue.then(async () => {
      if (this.disabled) return;
      try {
        await fs.appendFile(path.join(this.sessionDir, file), text, 'utf8');
      } catch (error) {
        this.disable(error);
      }
    });
  }

  private disable(error: unknown): void {
    if (this.disabled) return;
    this.disabled = true;
    this.options.onDisabled?.(error);
  }
}

function buildSessionName(): string {
  const now = new Date();
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${stamp}-${process.pid}`;
}

/** Names are timestamp-prefixed, so lexical descending sort is chronological. Errors are swallowed — retention pruning must never break capture. */
async function pruneOldSessions(baseDir: string, keep: number): Promise<void> {
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
    const stale = dirs.slice(keep);
    for (const name of stale) {
      await fs.rm(path.join(baseDir, name), { recursive: true, force: true });
    }
  } catch {
    // Retention pruning must never break capture.
  }
}
