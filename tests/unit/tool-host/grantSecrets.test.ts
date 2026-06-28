import { grantSecrets } from '@/tool-host/grantSecrets';

describe('grantSecrets', () => {
  const secretsById = { OPENAI_API_KEY: 'sk-open', SLACK_TOKEN: 'xoxb' };

  it('grants only ids the tool DECLARED at catalog time, intersected with available values', () => {
    const cataloged = { 'wc.mjs': ['OPENAI_API_KEY'] };
    expect(grantSecrets('wc.mjs', cataloged, secretsById)).toEqual({
      OPENAI_API_KEY: 'sk-open',
    });
  });

  it('closes the bypass: an id absent from the cataloged declaration is never granted', () => {
    // The serve manifest might list SLACK_TOKEN, but the catalog for wc.mjs only declared
    // OPENAI_API_KEY. The grant must be keyed off the cataloged declaration, so SLACK_TOKEN
    // (another tool's secret, present in the union/values) is withheld.
    const cataloged = { 'wc.mjs': ['OPENAI_API_KEY'] };
    const granted = grantSecrets('wc.mjs', cataloged, secretsById);
    expect(granted).not.toHaveProperty('SLACK_TOKEN');
  });

  it('grants nothing when the file has no cataloged entry (e.g. appeared after a failed scan)', () => {
    expect(grantSecrets('new.mjs', { 'wc.mjs': ['OPENAI_API_KEY'] }, secretsById)).toEqual({});
  });

  it('omits a cataloged id whose value is not present in the host env', () => {
    const cataloged = { 'wc.mjs': ['MISSING_KEY', 'OPENAI_API_KEY'] };
    expect(grantSecrets('wc.mjs', cataloged, secretsById)).toEqual({
      OPENAI_API_KEY: 'sk-open',
    });
  });

  it('returns an empty grant for an undefined file', () => {
    expect(grantSecrets(undefined, { 'wc.mjs': ['OPENAI_API_KEY'] }, secretsById)).toEqual({});
  });
});
