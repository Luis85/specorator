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

  it('withholds a cataloged id the CURRENT code no longer declares (stale grant after failed re-scan)', () => {
    // wc.mjs was cataloged with OPENAI_API_KEY, then edited to drop the declaration while a
    // re-scan failed (stale map preserved). The current manifest declares nothing, so the
    // narrowing gate withholds the lingering cataloged secret.
    const cataloged = { 'wc.mjs': ['OPENAI_API_KEY'] };
    expect(grantSecrets('wc.mjs', cataloged, secretsById, [])).toEqual({});
  });

  it('still cannot widen past the cataloged ceiling via the current manifest', () => {
    // The current manifest re-declares both ids, but the catalog only ever recorded
    // OPENAI_API_KEY for wc.mjs — the intersection keeps SLACK_TOKEN out.
    const cataloged = { 'wc.mjs': ['OPENAI_API_KEY'] };
    expect(grantSecrets('wc.mjs', cataloged, secretsById, ['OPENAI_API_KEY', 'SLACK_TOKEN'])).toEqual({
      OPENAI_API_KEY: 'sk-open',
    });
  });

  it('grants the cataloged id when the current code still declares it', () => {
    const cataloged = { 'wc.mjs': ['OPENAI_API_KEY'] };
    expect(grantSecrets('wc.mjs', cataloged, secretsById, ['OPENAI_API_KEY'])).toEqual({
      OPENAI_API_KEY: 'sk-open',
    });
  });
});
