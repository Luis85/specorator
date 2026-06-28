import { buildSystemPrompt, computeSystemPromptKey } from '../../../../src/core/prompt/mainAgent';

describe('buildSystemPrompt — identity suppression for bound agents', () => {
  const PERSONA = 'You are Code Reviewer — Reviews changes. When asked who you are, answer as Code Reviewer.';

  it('includes the built-in Specorator identity by default', () => {
    const prompt = buildSystemPrompt({ vaultPath: '/vault' });
    expect(prompt).toContain('## Identity & Role');
    expect(prompt).toContain('You are **Specorator**');
  });

  it('omits the Specorator identity when suppressIdentity is set, keeping operational rules', () => {
    const prompt = buildSystemPrompt(
      { vaultPath: '/vault' },
      { appendices: [PERSONA], suppressIdentity: true },
    );
    // Base identity is gone so it cannot compete with the bound persona.
    expect(prompt).not.toContain('You are **Specorator**');
    expect(prompt).not.toContain('## Identity & Role');
    // Operational rules the agent still needs to work in the vault are retained.
    expect(prompt).toContain('## Path Conventions');
    expect(prompt).toContain('## Obsidian Context');
    // The bound persona is present and becomes the sole identity.
    expect(prompt).toContain(PERSONA);
  });

  it('still includes the identity when appendices are present but suppressIdentity is false', () => {
    const prompt = buildSystemPrompt({ vaultPath: '/vault' }, { appendices: [PERSONA] });
    expect(prompt).toContain('You are **Specorator**');
    expect(prompt).toContain(PERSONA);
  });
});

describe('computeSystemPromptKey — restart correctness on identity suppression', () => {
  it('changes when suppressIdentity toggles so the persistent query restarts', () => {
    const settings = { vaultPath: '/vault' };
    const withIdentity = computeSystemPromptKey(settings, { appendices: ['p'] });
    const suppressed = computeSystemPromptKey(settings, { appendices: ['p'], suppressIdentity: true });
    expect(withIdentity).not.toBe(suppressed);
  });
});
