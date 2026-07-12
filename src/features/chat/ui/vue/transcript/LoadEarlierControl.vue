<script setup lang="ts">
import { t } from '../../../../../i18n/i18n';

/**
 * Reproduces `MessageRenderer.renderLoadEarlierControl`'s
 * `.specorator-load-earlier` > `.specorator-load-earlier-btn` DOM. Growing the
 * render window (and the scroll-anchor math) is the parent's job
 * (`TranscriptRoot`) — this component only emits the click.
 */
defineEmits<{ loadEarlier: [] }>();
</script>

<template>
  <div class="specorator-load-earlier">
    <button
      class="specorator-load-earlier-btn"
      type="button"
      @click="$emit('loadEarlier')"
    >
      {{ t('chat.loadEarlier') }}
    </button>
  </div>
</template>
