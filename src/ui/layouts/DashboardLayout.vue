<script setup lang="ts">
import ErrorBoundary from '../components/ErrorBoundary.vue'
</script>

<template>
  <div class="sp-layout sp-layout--dashboard" data-testid="layout-dashboard">
    <header v-if="$slots.header" class="sp-layout__header" data-testid="layout-dashboard-header">
      <slot name="header" />
    </header>

    <main class="sp-layout__body" data-testid="layout-dashboard-body">
      <ErrorBoundary>
        <slot />
      </ErrorBoundary>
    </main>

    <footer v-if="$slots.footer" class="sp-layout__footer" data-testid="layout-dashboard-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.sp-layout--dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--background-primary);
}

.sp-layout__header {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--background-modifier-border);
}

.sp-layout__body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  align-content: start;
}

.sp-layout__footer {
  flex-shrink: 0;
  padding: 0.75rem 1.5rem;
  border-top: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  font-size: 0.8125rem;
}
</style>
