<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <h4
    class="specorator-title-text"
    :aria-label="title"
    :title="title"
  >
    {{ title }}
  </h4>
</template>
