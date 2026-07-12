<script setup lang="ts">
import { inject } from 'vue';

import type { ImageAttachment } from '../../../../../../core/types';
import { CALLBACKS_KEY } from '../transcriptKeys';

/**
 * Reproduces `rendering/MessageImageRenderer.ts`'s `renderMessageImages` DOM
 * contract: a fallback name-only div when `resolveImageSrc` yields no usable
 * source (no vault file, no base64 fallback), otherwise an `<img>` whose
 * click opens the full-size modal via the injected `showFullImage` callback.
 * Both callbacks come from the seam rather than being reimplemented here —
 * this component is display-only.
 */
defineProps<{ images: ImageAttachment[] }>();

const callbacks = inject(CALLBACKS_KEY, undefined);

function srcFor(image: ImageAttachment): string {
  return callbacks?.resolveImageSrc(image) ?? '';
}

function onImageClick(image: ImageAttachment): void {
  callbacks?.showFullImage(image);
}
</script>

<template>
  <div class="specorator-message-images">
    <template
      v-for="image in images"
      :key="image.id"
    >
      <div
        v-if="!srcFor(image)"
        class="specorator-message-image-fallback"
      >
        {{ image.name || 'image' }}
      </div>
      <div
        v-else
        class="specorator-message-image"
      >
        <img
          :src="srcFor(image)"
          :alt="image.name"
          loading="lazy"
          decoding="async"
          @click="onImageClick(image)"
        >
      </div>
    </template>
  </div>
</template>
