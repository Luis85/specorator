import type { EmittableLevel, LogEntry, LogSink } from './types';

interface ConsoleLike {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * The single sanctioned console site in the plugin. All other code logs through
 * the Logger; the `no-console` lint rule enforces this everywhere else.
 */
export function createConsoleSink(
   
  target: ConsoleLike = console,
): LogSink {
  // Arrow wrappers rather than `.bind`: some TS lib versions type
  // `Function.prototype.bind` as returning `any`, which trips the marketplace
  // validator's no-unsafe-assignment. Direct calls preserve `target` as `this`.
  const methods: Record<EmittableLevel, (...args: unknown[]) => void> = {
    error: (...args) => target.error(...args),
    warn: (...args) => target.warn(...args),
    info: (...args) => target.info(...args),
    debug: (...args) => target.debug(...args),
  };
  return (entry: LogEntry) => {
    methods[entry.level](`[${entry.scope}] ${entry.msg}`, ...entry.args);
  };
}
