<script setup lang="ts">
import ErrorBoundary from '../components/ErrorBoundary.vue'
</script>

<template>
  <div class="sp-layout sp-layout--panel" data-testid="layout-panel">
    <header v-if="$slots.header" class="sp-layout__header" data-testid="layout-panel-header">
      <slot name="header" />
    </header>

    <div class="sp-layout__body" data-testid="layout-panel-body">
      <ErrorBoundary>
        <slot />
      </ErrorBoundary>
    </div>

    <footer v-if="$slots.footer" class="sp-layout__footer" data-testid="layout-panel-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.sp-layout--panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--background-secondary);
}

.sp-layout__header {
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-normal);
}

.sp-layout__body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.sp-layout__footer {
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
