<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div data-testid="hello-view">{{ t('hello.title') }}</div>
</template>

<style scoped>
/* Module-scoped styles only. Do not add global selectors here. */
</style>
