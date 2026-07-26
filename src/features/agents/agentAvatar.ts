import { type App, setIcon } from 'obsidian';

import { getVaultFileByPath } from '../../utils/obsidianCompat';
import type { AgentPersona } from './agentTypes';

/** Glyph icon proportion of the avatar diameter for the built-in persona. */
const ICON_RATIO = 0.58;

/**
 * Turn a persona's vault-relative image path into a displayable resource URL, or
 * null when it can't be shown — no app/vault access, an empty/whitespace path, a
 * path that resolves to no vault file (deleted/renamed), or a getResourcePath
 * throw. A null return makes the avatar fall through to emoji/icon/initials, so a
 * broken image never blanks the chip. Mirrors imageEmbed.ts's resolution path.
 */
function resolveImageSrc(app: App | undefined, image: string | undefined): string | null {
  const path = image?.trim();
  if (!app || !path) return null;
  try {
    const file = getVaultFileByPath(app, path);
    if (!file) return null;
    return app.vault.getResourcePath(file) || null;
  } catch {
    return null;
  }
}

/**
 * Render a persona avatar: a circular chip whose size, color, and content come
 * from the persona. The dynamic per-persona color is injected as the
 * `--agent-color` CSS custom property (the persona color is itself an Obsidian
 * `var(--color-…)` token); the chip's background / text / border all derive from
 * it in CSS via `color-mix`, so no static color or `rgba` literal is set here.
 * The size is likewise pushed as `--agent-avatar-size` rather than assigned to
 * `style.*` directly (lint: `no-static-styles-assignment`).
 *
 * Precedence for custom personas: image → emoji → icon → initials → cpu.
 * - Built-in personas render the `cpu` icon at ~58% of the avatar.
 * - An image avatar needs `app` to resolve its vault-relative path to a resource
 *   URL; without `app` (or on an unresolvable path) it falls through so a broken
 *   image never blanks the chip.
 * - Custom personas otherwise render their `icon` glyph when set, else `initials`.
 *
 * `title` (and `aria-label`) is the persona name so the assignee reads on hover
 * and to assistive tech.
 */
export function renderAgentAvatar(
  parent: HTMLElement,
  persona: AgentPersona,
  sizePx: number,
  app?: App,
): HTMLElement {
  const avatar = parent.createSpan({ cls: 'specorator-agent-avatar' });
  avatar.setCssProps({
    '--agent-color': persona.color,
    '--agent-avatar-size': `${sizePx}px`,
    '--agent-avatar-icon-size': `${Math.round(sizePx * ICON_RATIO)}px`,
  });
  avatar.setAttr('title', persona.name);
  avatar.setAttr('aria-label', persona.name);

  if (!persona.builtin) {
    const imageSrc = resolveImageSrc(app, persona.image);
    if (imageSrc) {
      avatar.addClass('specorator-agent-avatar--image');
      // Decorative: the chip already carries the persona name as title + aria-label.
      avatar.createEl('img', {
        cls: 'specorator-agent-avatar-img',
        attr: { src: imageSrc, alt: '' },
      });
      return avatar;
    }
  }

  if (!persona.builtin && persona.emoji) {
    avatar.addClass('specorator-agent-avatar--emoji');
    avatar.setText(persona.emoji);
    return avatar;
  }

  const glyph = persona.builtin ? 'cpu' : persona.icon;
  if (glyph) {
    // The mock `setIcon` is a no-op; record the glyph intent so tests can assert
    // it (consistent with the rest of the board / modal).
    avatar.setAttr('data-icon', glyph);
    setIcon(avatar, glyph);
  } else if (persona.initials) {
    avatar.addClass('specorator-agent-avatar--initials');
    avatar.setText(persona.initials);
  } else {
    avatar.setAttr('data-icon', 'cpu');
    setIcon(avatar, 'cpu');
  }

  return avatar;
}
