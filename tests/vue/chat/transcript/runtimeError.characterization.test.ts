import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInlineRuntimeError } from '@/features/chat/rendering/InlineRuntimeError';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `renderInlineRuntimeError` produces for each classified
 * {@link RuntimeErrorKind} — card class, header icon/title, body text vs.
 * classified-body-key text, the unauthenticated login-hint row, the
 * collapsible raw-message details row, and the settings/retry action button
 * set — so `blocks/RuntimeErrorCard.vue` can be built to reproduce it
 * exactly. Deleted alongside the legacy renderer in a later cleanup task;
 * its Vue parity twin is `runtimeErrorCard.test.ts`.
 */
describe('renderInlineRuntimeError characterization', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('generic: card class + kind-scoped title, raw content as body, no details row, retry-only action', () => {
    const onRetry = vi.fn();
    renderInlineRuntimeError(parentEl, { kind: 'generic', content: 'Network failed', providerId: 'claude', onRetry });

    const card = parentEl.querySelector('.specorator-runtime-error-card')!;
    expect(card.classList.contains('specorator-runtime-error-generic')).toBe(true);

    const header = card.querySelector('.specorator-runtime-error-header') as HTMLElement;
    const icon = header.querySelector('.specorator-runtime-error-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(icon, 'alert-triangle');
    expect(header.querySelector('.specorator-runtime-error-title')?.textContent).toBeTruthy();

    expect(card.querySelector('.specorator-runtime-error-body')?.textContent).toBe('Network failed');
    expect(card.querySelector('.specorator-runtime-error-details')).toBeNull();
    expect(card.querySelector('.specorator-runtime-error-hint')).toBeNull();

    const buttons = card.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList.contains('specorator-runtime-error-button-primary')).toBe(true);
    (buttons[0] as HTMLElement).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('cli-not-found: classified body text + raw content in a details row + settings AND retry actions in order', () => {
    const onOpenSettings = vi.fn();
    const onRetry = vi.fn();
    renderInlineRuntimeError(parentEl, {
      kind: 'cli-not-found',
      content: 'spawn claude ENOENT',
      providerId: 'claude',
      onOpenSettings,
      onRetry,
    });

    const card = parentEl.querySelector('.specorator-runtime-error-card')!;
    expect(card.classList.contains('specorator-runtime-error-cli-not-found')).toBe(true);
    // The classified body is guided copy, not the raw message.
    expect(card.querySelector('.specorator-runtime-error-body')?.textContent).not.toBe('spawn claude ENOENT');

    const details = card.querySelector('.specorator-runtime-error-details')!;
    expect(details.querySelector('.specorator-runtime-error-details-text')?.textContent).toBe(
      'spawn claude ENOENT',
    );

    const buttons = card.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(2);
    (buttons[0] as HTMLElement).click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    (buttons[1] as HTMLElement).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('unauthenticated: renders a provider-specific copyable login hint row', () => {
    renderInlineRuntimeError(parentEl, {
      kind: 'unauthenticated',
      content: '401 Unauthorized',
      providerId: 'cursor',
      onRetry: vi.fn(),
    });

    const card = parentEl.querySelector('.specorator-runtime-error-card')!;
    expect(card.classList.contains('specorator-runtime-error-unauthenticated')).toBe(true);

    const hint = card.querySelector('.specorator-runtime-error-hint')!;
    expect(hint.querySelector('.specorator-runtime-error-hint-command')?.textContent).toBe('cursor-agent login');
    const copyBtn = hint.querySelector('.specorator-runtime-error-hint-copy') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(copyBtn, 'copy');
    expect(copyBtn.getAttribute('aria-label')).toBeTruthy();
  });

  it('unauthenticated falls back to the generic hint for an unrecognized provider id', () => {
    renderInlineRuntimeError(parentEl, {
      kind: 'unauthenticated',
      content: 'auth failed',
      providerId: 'some-unknown-provider',
    });
    const command = parentEl.querySelector('.specorator-runtime-error-hint-command')?.textContent;
    expect(command).toBeTruthy();
    expect(command).not.toBe('claude login');
  });

  it('context-too-large: guided body, no settings action even when onOpenSettings is provided', () => {
    const onOpenSettings = vi.fn();
    const onRetry = vi.fn();
    renderInlineRuntimeError(parentEl, {
      kind: 'context-too-large',
      content: 'prompt is too long',
      providerId: 'claude',
      onOpenSettings,
      onRetry,
    });

    const card = parentEl.querySelector('.specorator-runtime-error-card')!;
    expect(card.classList.contains('specorator-runtime-error-context-too-large')).toBe(true);
    expect(card.querySelector('.specorator-runtime-error-body')?.textContent).toBeTruthy();

    const buttons = card.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(1); // retry only — settings is gated to cli-not-found/unauthenticated
    (buttons[0] as HTMLElement).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('omits every action button when neither onOpenSettings nor onRetry is provided', () => {
    renderInlineRuntimeError(parentEl, { kind: 'cli-not-found', content: 'ENOENT', providerId: 'claude' });
    expect(parentEl.querySelectorAll('.specorator-runtime-error-button')).toHaveLength(0);
  });
});
