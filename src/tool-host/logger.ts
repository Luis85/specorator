import { appendFileSync } from 'node:fs';
import type { ToolHandlerCtx } from './types';

export interface LoggerOptions {
  /** Where each formatted line goes. Default: stderr + append to logFilePath. */
  sink?: (line: string) => void;
  /** Timestamp source (injectable for tests). Default: ISO string. */
  now?: () => string;
  /** Absolute path of the host log file (used by the default sink). */
  logFilePath?: string;
}

function format(now: string, level: string, tool: string, message: string, data?: unknown): string {
  const tail = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  return `${now} [${level}] [${tool}] ${message}${tail}`;
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
