<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const images = computed(() => store.chips.images);
</script>

<template>
  <div
    class="specorator-image-preview"
    :class="{ 'specorator-visible-flex': images.length > 0, 'specorator-hidden': images.length === 0 }"
  >
    <div
      v-for="img in images"
      :key="img.id"
      class="specorator-image-chip"
    >
      <span
        class="specorator-image-thumb"
        role="button"
        @click="cb?.onOpenImage(img.id)"
      ><img
        :src="img.src"
        :alt="img.name"
      ></span>
      <span class="specorator-image-info">
        <span
          class="specorator-image-name"
          :title="img.name"
        >{{ img.name }}</span>
        <span class="specorator-image-size">{{ img.sizeLabel }}</span>
      </span>
      <!-- .stop so removing does NOT also fire the thumbnail's open-preview click. -->
      <span
        class="specorator-image-remove"
        aria-label="Remove image"
        @click.stop="cb?.onRemoveChip(img.id, 'image')"
      >×</span>
    </div>
  </div>
</template>
