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
});
