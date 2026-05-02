<script setup lang="ts">
import type { FeatureStatus } from '@/domain/feature/FeatureStatus'

defineProps<{ status: FeatureStatus }>()
</script>

<template>
  <span :class="['sp-badge', `sp-badge--${status}`]">
    {{ $t(`feature.status.${status}`) }}
  </span>
</template>

<style scoped>
.sp-badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sp-badge--draft    { background: var(--background-modifier-border); color: var(--text-muted); }
.sp-badge--active   { background: #1a4731; color: #4ade80; }
.sp-badge--archived { background: #1e2a3a; color: #60a5fa; }
.sp-badge--abandoned { background: #2a1a1a; color: #f87171; }
</style>
