import { Notice } from 'obsidian';
import * as path from 'path';

import type { ImageAttachment, ImageMediaType } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { formatImageSize } from '../utils/imageAttachment';
import { openImageModal } from './imageModal';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export interface ImageContextCallbacks {
  onImagesChanged: () => void;
}

export class ImageContextManager {
  private callbacks: ImageContextCallbacks;
  private containerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private attachedImages: Map<string, ImageAttachment> = new Map();
  private enabled = true;
  /** Monotonic token — stale async conversions are dropped after clear/reset. */
  private attachGeneration = 0;

  // Vue owns the preview strip (`.specorator-image-preview`); this manager keeps
  // the image Map + async conversion + full-size modal only. It still fires
  // onImagesChanged so the reactive chip slice re-projects.
  constructor(
    containerEl: HTMLElement,
    inputEl: HTMLTextAreaElement,
    callbacks: ImageContextCallbacks
  ) {
    this.containerEl = containerEl;
    this.inputEl = inputEl;
    this.callbacks = callbacks;

    this.setupPasteHandler();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.attachedImages.size > 0) {
      this.clearImages();
    }
  }

  getAttachedImages(): ImageAttachment[] {
    return Array.from(this.attachedImages.values());
  }

  hasImages(): boolean {
    return this.attachedImages.size > 0;
  }

  /** Removes an image attachment by its generated id (Vue chip remove). */
  removeImageById(id: string): void {
    if (this.attachedImages.delete(id)) {
      this.callbacks.onImagesChanged();
    }
  }

  /** Opens the full-size preview for an attachment — reuses the existing modal opener. */
  openImageById(id: string): void {
    const image = this.attachedImages.get(id);
    if (image) this.showFullImage(image);
  }

  clearImages() {
    this.attachGeneration += 1;
    this.attachedImages.clear();
    this.callbacks.onImagesChanged();
  }

  /** Sets images directly (used for queued messages). */
  setImages(images: ImageAttachment[]) {
    this.attachGeneration += 1;
    this.attachedImages.clear();
    for (const image of images) {
      this.attachedImages.set(image.id, image);
    }
    this.callbacks.onImagesChanged();
  }


  private setupPasteHandler() {
    this.inputEl.addEventListener('paste', (e) => {
      void (async (): Promise<void> => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await this.addImageFromFile(file, 'paste');
          }
          return;
        }
      }
      })();
    });
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') && this.getMediaType(file.name) !== null;
  }

  private getMediaType(filename: string): ImageMediaType | null {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS[ext] || null;
  }

  async addImageFromFile(file: File, source: 'paste' | 'drop'): Promise<boolean> {
    if (!this.enabled) {
      new Notice(t('chat.image.unsupported'));
      return false;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      this.notifyImageError(`Image exceeds ${this.formatSize(MAX_IMAGE_SIZE)} limit.`);
      return false;
    }

    const mediaType = this.getMediaType(file.name) || (file.type as ImageMediaType);
    if (!mediaType) {
      this.notifyImageError('Unsupported image type.');
      return false;
    }

    // Capture (do NOT bump) the generation: it invalidates only on a
    // clear/set/reset (clearImages/setImages bump it), so an in-flight conversion
    // is dropped when the list is reset out from under it — but two concurrent
    // paste/drop adds must BOTH complete rather than cancel each other.
    const generation = this.attachGeneration;

    try {
      const base64 = await this.fileToBase64(file);
      if (generation !== this.attachGeneration) {
        return false;
      }

      const attachment: ImageAttachment = {
        id: this.generateId(),
        name: file.name || `image-${Date.now()}.${mediaType.split('/')[1]}`,
        mediaType,
        data: base64,
        size: file.size,
        source,
      };

      this.attachedImages.set(attachment.id, attachment);
      this.callbacks.onImagesChanged();
      return true;
    } catch (error) {
      this.notifyImageError('Failed to attach image.', error);
      return false;
    }
  }

  private async fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  }

  // ============================================
  // Private: Full-size Image Modal
  // ============================================

  private showFullImage(image: ImageAttachment) {
    const ownerDocument = this.containerEl.ownerDocument ?? window.document;
    openImageModal({
      ownerDocument,
      src: `data:${image.mediaType};base64,${image.data}`,
      alt: image.name,
    });
  }

  private generateId(): string {
    return `img-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private formatSize(bytes: number): string {
    return formatImageSize(bytes);
  }

  private notifyImageError(message: string, error?: unknown) {
    let userMessage = message;
    if (error instanceof Error) {
      if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
        userMessage = `${message} (File not found)`;
      } else if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
        userMessage = `${message} (Permission denied)`;
      }
    }
    new Notice(userMessage);
  }
}
