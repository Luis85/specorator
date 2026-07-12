import { type App, Notice } from 'obsidian';

import type { ImageAttachment } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { getVaultFileByPath } from '../../../utils/obsidianCompat';
import { openImageModal } from '../ui/imageModal';

/**
 * Pure image-attachment helpers shared by the imperative `MessageImageRenderer`
 * and the Vue transcript's image card / callbacks. Kept here (outside
 * `rendering/`) deliberately so it SURVIVES the imperative renderer deletion in
 * Task 18b: the Vue `TranscriptCallbacks.resolveImageSrc` / `showFullImage`
 * delegate to these, and `MessageImageRenderer` delegates to them too until it
 * is removed.
 */

/**
 * Returns the best `<img src>` for an attachment: the vault resource path when
 * the referenced file exists, the base64 data URI otherwise, or null when
 * neither is usable. Vault file is preferred over the inline base64 blob.
 */
export function resolveImageAttachmentSrc(app: App, image: ImageAttachment): string | null {
  if (image.path) {
    const file = getVaultFileByPath(app, image.path);
    if (file) return app.vault.getResourcePath(file);
  }
  if (image.data) return `data:${image.mediaType};base64,${image.data}`;
  return null;
}

/**
 * Opens the full-size image modal overlay for an attachment, resolving its src
 * with {@link resolveImageAttachmentSrc}. Surfaces a brief Notice rather than a
 * blank modal when the image is unavailable. `ownerDocument` places the overlay
 * in the same document as the triggering element (Obsidian popout windows).
 */
export function showFullImageAttachment(
  app: App,
  ownerDocument: Document,
  image: ImageAttachment,
): void {
  const src = resolveImageAttachmentSrc(app, image);
  if (!src) {
    new Notice(t('chat.image.unavailable'));
    return;
  }
  openImageModal({ ownerDocument, src, alt: image.name });
}
