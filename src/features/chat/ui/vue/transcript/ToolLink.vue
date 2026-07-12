<script setup lang="ts">
import IconSpan from './IconSpan.vue';

/**
 * Reproduces the `appendToolLink` DOM contract from `webSearchRenderer.ts`:
 * an external link row used both for parsed web-search result links and for
 * the open_page/find_in_page action-card rows.
 */
defineProps<{ title: string; url: string }>();
</script>

<template>
  <a
    class="specorator-tool-link"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
  >
    <IconSpan
      icon="external-link"
      css-class="specorator-tool-link-icon"
    />
    <span class="specorator-tool-link-title">{{ title }}</span>
  </a>
</template>
