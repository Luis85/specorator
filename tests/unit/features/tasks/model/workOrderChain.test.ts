// tests/unit/features/tasks/model/workOrderChain.test.ts
import {
  chainConfigFrontmatterLines,
  DEFAULT_CHAIN_TRIGGER,
  parseChainConfig,
} from '../../../../../src/features/tasks/model/workOrderChain';

describe('parseChainConfig', () => {
  it('returns null when template, title, and objective are all absent', () => {
    expect(parseChainConfig({})).toBeNull();
    expect(parseChainConfig({ chain_trigger: 'review' })).toBeNull();
  });

  it('treats an objective-only config as configured', () => {
    expect(parseChainConfig({ chain_objective: 'Do the next thing' })).toEqual({
      trigger: 'done',
      objective: 'Do the next thing',
    });
  });

  it('reads template + title + objective + trigger', () => {
    expect(
      parseChainConfig({
        chain_template: 'Implement stage',
        chain_title: 'Wire API',
        chain_objective: 'obj',
        chain_trigger: 'review',
      }),
    ).toEqual({ template: 'Implement stage', title: 'Wire API', objective: 'obj', trigger: 'review' });
  });

  it('defaults an absent or invalid trigger to done', () => {
    expect(parseChainConfig({ chain_title: 'x' })?.trigger).toBe('done');
    expect(parseChainConfig({ chain_title: 'x', chain_trigger: 'bogus' })?.trigger).toBe('done');
    expect(DEFAULT_CHAIN_TRIGGER).toBe('done');
  });

  it('ignores blank/whitespace values', () => {
    expect(parseChainConfig({ chain_template: '   ', chain_title: '' })).toBeNull();
  });
});

describe('chainConfigFrontmatterLines', () => {
  it('emits only the set keys, JSON-quoting string values', () => {
    expect(chainConfigFrontmatterLines({ template: 'Impl', trigger: 'done' })).toEqual([
      'chain_template: "Impl"',
      'chain_trigger: done',
    ]);
  });

  it('emits title/objective when present', () => {
    expect(chainConfigFrontmatterLines({ title: 'T', objective: 'O', trigger: 'review' })).toEqual([
      'chain_title: "T"',
      'chain_objective: "O"',
      'chain_trigger: review',
    ]);
  });
});
