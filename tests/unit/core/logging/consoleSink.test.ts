import { createConsoleSink } from '../../../../src/core/logging/consoleSink';
import type { LogEntry } from '../../../../src/core/logging/types';

function entry(level: LogEntry['level']): LogEntry {
  return { ts: 0, level, scope: 'area', msg: 'hi', args: [{ a: 1 }] };
}

describe('createConsoleSink', () => {
  it('routes each level to the matching console method with a scoped prefix', () => {
    const calls: Array<[string, unknown[]]> = [];
    const fake = {
      error: (...a: unknown[]) => calls.push(['error', a]),
      warn: (...a: unknown[]) => calls.push(['warn', a]),
      info: (...a: unknown[]) => calls.push(['info', a]),
      debug: (...a: unknown[]) => calls.push(['debug', a]),
    };
    const sink = createConsoleSink(fake);

    sink(entry('error'));
    sink(entry('warn'));
    sink(entry('info'));
    sink(entry('debug'));

    expect(calls.map((c) => c[0])).toEqual(['error', 'warn', 'info', 'debug']);
    expect(calls[0][1][0]).toBe('[area] hi');
    expect(calls[0][1][1]).toEqual({ a: 1 });
  });
});
