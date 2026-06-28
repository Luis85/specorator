import { appendFileSync } from 'node:fs';

import { redactArgs, scrubString } from '../core/logging/redact';
import type { ToolHandlerCtx } from './types';

export interface LoggerOptions {
  /** Where each formatted line goes. Default: stderr + append to logFilePath. */
  sink?: (line: string) => void;
  /** Timestamp source (injectable for tests). Default: ISO string. */
  now?: () => string;
  /** Absolute path of the host log file (used by the default sink). */
  logFilePath?: string;
}

/**
 * Serialize redacted data without throwing. `JSON.stringify` throws on circular
 * refs and BigInt; a logging failure must never fail an otherwise-successful
 * tool run, so fall back to a non-throwing representation.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function format(now: string, level: string, tool: string, message: string, data?: unknown): string {
  // Deep-mask secret-keyed values before serializing, then scrub secret-shaped
  // substrings from the whole line — so neither a keyed token in `data` nor an
  // inline `Bearer ...`/`sk-...` shape in `message` lands in the vault log file.
  const redacted = data === undefined ? undefined : redactArgs([data])[0];
  const tail = redacted === undefined ? '' : ` ${safeStringify(redacted)}`;
  return scrubString(`${now} [${level}] [${tool}] ${message}${tail}`);
}

export function createLogger(tool: string, options: LoggerOptions = {}): ToolHandlerCtx['logger'] {
  const now = options.now ?? (() => new Date().toISOString());
  const sink =
    options.sink ??
    ((line: string) => {
      process.stderr.write(`${line}\n`);
      if (options.logFilePath) {
        try {
          appendFileSync(options.logFilePath, `${line}\n`, 'utf8');
        } catch {
          /* logging must never throw */
        }
      }
    });
  const emit = (level: string, message: string, data?: unknown) =>
    sink(format(now(), level, tool, message, data));
  return {
    info: (m, d) => emit('info', m, d),
    warn: (m, d) => emit('warn', m, d),
    error: (m, d) => emit('error', m, d),
  };
}
