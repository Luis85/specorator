/**
 * @jest-environment jsdom
 */
import '../../../setup/obsidianDom';

import type { App } from 'obsidian';

import { renderAgentAvatar } from '../../../../src/features/agents/agentAvatar';
import type { AgentPersona } from '../../../../src/features/agents/agentTypes';
import { resolvePersona } from '../../../../src/features/agents/personaRegistry';

const STANDARD = resolvePersona(undefined);

const CUSTOM: AgentPersona = {
  id: 'refactorer',
  name: 'Refactorer',
  color: 'var(--color-purple)',
  initials: 'RF',
};

/** App whose vault resolves any path to a TFile-like value and a stable URL. */
function appWithImage(): App {
  return {
    vault: {
      getAbstractFileByPath: (p: string) => ({ path: p, basename: p.split('/').pop() ?? p }),
      getResourcePath: (f: { path: string }) => `app://vault/${f.path}`,
    },
  } as unknown as App;
}

/** App whose vault cannot find the file — resolution fails, avatar must fall through. */
function appMissingFile(): App {
  return {
    vault: {
      getAbstractFileByPath: () => null,
      getResourcePath: () => '',
    },
  } as unknown as App;
}

describe('renderAgentAvatar', () => {
  it('renders a circular avatar chip carrying the persona name as title + aria-label', () => {
    const host = document.createElement('div');
    const avatar = renderAgentAvatar(host, STANDARD, 20);
    expect(avatar.classList.contains('specorator-agent-avatar')).toBe(true);
    expect(avatar.getAttribute('title')).toBe('Standard');
    expect(avatar.getAttribute('aria-label')).toBe('Standard');
  });

  it('renders the Standard built-in with the cpu icon (intent recorded via data-icon)', () => {
    const host = document.createElement('div');
    const avatar = renderAgentAvatar(host, STANDARD, 20);
    expect(avatar.getAttribute('data-icon')).toBe('cpu');
    // No initials text for the icon-backed built-in.
    expect(avatar.textContent).toBe('');
  });

  it('injects the persona color + size as CSS custom properties (no static color/hex)', () => {
    const host = document.createElement('div');
    const avatar = renderAgentAvatar(host, STANDARD, 20);
    expect(avatar.style.getPropertyValue('--agent-color')).toBe('var(--color-base-90)');
    expect(avatar.style.getPropertyValue('--agent-avatar-size')).toBe('20px');
    // Icon sized to ~58% of the avatar (20 * 0.58 = 11.6 → 12).
    expect(avatar.style.getPropertyValue('--agent-avatar-icon-size')).toBe('12px');
  });

  it('sizes the modal avatar at 18px (icon ~58% → 10px)', () => {
    const host = document.createElement('div');
    const avatar = renderAgentAvatar(host, STANDARD, 18);
    expect(avatar.style.getPropertyValue('--agent-avatar-size')).toBe('18px');
    expect(avatar.style.getPropertyValue('--agent-avatar-icon-size')).toBe('10px');
  });

  it('renders a custom persona with its initials instead of an icon', () => {
    const host = document.createElement('div');
    const avatar = renderAgentAvatar(host, CUSTOM, 20);
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(true);
    expect(avatar.textContent).toBe('RF');
    expect(avatar.getAttribute('data-icon')).toBeNull();
    expect(avatar.style.getPropertyValue('--agent-color')).toBe('var(--color-purple)');
  });

  it('appends the avatar to the provided parent', () => {
    const host = document.createElement('div');
    renderAgentAvatar(host, STANDARD, 20);
    expect(host.querySelector('.specorator-agent-avatar')).not.toBeNull();
  });

  it('renders a non-builtin persona with icon: wrench using the icon glyph, not initials', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'fixer',
      name: 'Fixer',
      color: 'var(--color-orange)',
      initials: 'FX',
      icon: 'wrench',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.getAttribute('data-icon')).toBe('wrench');
    // icon takes precedence — no initials text
    expect(avatar.textContent).toBe('');
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(false);
  });

  it('renders a non-builtin persona with only initials (no icon) using initials', () => {
    const host = document.createElement('div');
    const avatar = renderAgentAvatar(host, CUSTOM, 20);
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(true);
    expect(avatar.textContent).toBe('RF');
    expect(avatar.getAttribute('data-icon')).toBeNull();
  });

  it('falls back to cpu for a non-builtin persona with no icon and no initials', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'empty',
      name: 'Empty',
      color: 'var(--color-base-70)',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.getAttribute('data-icon')).toBe('cpu');
    expect(avatar.textContent).toBe('');
  });

  it('renders a non-builtin persona emoji as text, taking precedence over icon + initials', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)',
      initials: 'SC', icon: 'flask-conical', emoji: '🔬',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.classList.contains('specorator-agent-avatar--emoji')).toBe(true);
    expect(avatar.textContent).toBe('🔬');
    expect(avatar.getAttribute('data-icon')).toBeNull();
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(false);
  });

  it('ignores emoji for the built-in persona (cpu still wins)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'standard', name: 'Standard', color: 'var(--color-base-90)', builtin: true, emoji: '🤖',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.getAttribute('data-icon')).toBe('cpu');
    expect(avatar.textContent).toBe('');
  });

  it('renders an <img> with the resolved vault resource path when persona.image is set', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)', initials: 'SC', image: 'avatars/sci.png',
    };
    const avatar = renderAgentAvatar(host, persona, 20, appWithImage());
    const img = avatar.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('app://vault/avatars/sci.png');
    expect(avatar.classList.contains('specorator-agent-avatar--image')).toBe(true);
  });

  it('renders the image ahead of emoji, icon, and initials (image-first precedence)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)',
      initials: 'SC', icon: 'flask-conical', emoji: '🔬', image: 'avatars/sci.png',
    };
    const avatar = renderAgentAvatar(host, persona, 20, appWithImage());
    expect(avatar.querySelector('img')).not.toBeNull();
    expect(avatar.getAttribute('data-icon')).toBeNull();
    expect(avatar.textContent).toBe('');
    expect(avatar.classList.contains('specorator-agent-avatar--emoji')).toBe(false);
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(false);
  });

  it('falls back to emoji when the image path cannot be resolved (broken/renamed file)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)', emoji: '🔬', image: 'gone.png',
    };
    const avatar = renderAgentAvatar(host, persona, 20, appMissingFile());
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.classList.contains('specorator-agent-avatar--emoji')).toBe(true);
    expect(avatar.textContent).toBe('🔬');
  });

  it('falls through to initials when the image is unresolvable and nothing else is set', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)', initials: 'SC', image: 'gone.png',
    };
    const avatar = renderAgentAvatar(host, persona, 20, appMissingFile());
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(true);
    expect(avatar.textContent).toBe('SC');
  });

  it('does not treat a whitespace-only image path as an image (emoji wins)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)', emoji: '🔬', image: '   ',
    };
    const avatar = renderAgentAvatar(host, persona, 20, appWithImage());
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.classList.contains('specorator-agent-avatar--emoji')).toBe(true);
  });

  it('ignores the image when no app is passed (falls through to emoji)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)', emoji: '🔬', image: 'avatars/sci.png',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.classList.contains('specorator-agent-avatar--emoji')).toBe(true);
  });

  it('ignores the image for the built-in persona (cpu still wins)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'standard', name: 'Standard', color: 'var(--color-base-90)', builtin: true, image: 'avatars/sci.png',
    };
    const avatar = renderAgentAvatar(host, persona, 20, appWithImage());
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.getAttribute('data-icon')).toBe('cpu');
  });
});
