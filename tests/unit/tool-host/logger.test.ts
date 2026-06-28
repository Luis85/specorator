import { createLogger } from '@/tool-host/logger';

describe('createLogger', () => {
  it('emits tool-tagged, level-prefixed lines to the sink', () => {
    const lines: string[] = [];
    const log = createLogger('word_count', { sink: (l) => lines.push(l), now: () => 'T' });
    log.info('counted', { n: 3 });
    log.error('boom');
    expect(lines).toEqual([
      'T [info] [word_count] counted {"n":3}',
      'T [error] [word_count] boom',
    ]);
  });

  it('redacts secret-keyed values in the data payload before persisting', () => {
    const lines: string[] = [];
    const log = createLogger('fetcher', { sink: (l) => lines.push(l), now: () => 'T' });
    log.info('called', { apiKey: 'sk-secret123', token: 'abc', user: 'alice' });
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).not.toContain('sk-secret123');
    expect(line).not.toContain('"token":"abc"');
    expect(line).toContain('[redacted]');
    // Non-secret keys survive untouched.
    expect(line).toContain('"user":"alice"');
  });

  it('scrubs secret-shaped substrings inside the message itself', () => {
    const lines: string[] = [];
    const log = createLogger('fetcher', { sink: (l) => lines.push(l), now: () => 'T' });
    log.warn('auth header was Bearer abcdef123456 and key sk-deadbeef0011');
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).not.toContain('abcdef123456');
    expect(line).not.toContain('sk-deadbeef0011');
    expect(line).toContain('[redacted]');
  });
});
