<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import ErrorBoundary from '../components/ErrorBoundary.vue'

const { t } = useI18n()
</script>

<template>
  <div class="sp-layout sp-layout--main" data-testid="layout-main">
    <nav class="sp-layout__nav">
      <RouterLink class="sp-layout__nav-link" to="/" active-class="sp-layout__nav-link--active" exact>
        {{ t('nav.home') }}
      </RouterLink>
      <RouterLink class="sp-layout__nav-link" to="/features" active-class="sp-layout__nav-link--active">
        {{ t('nav.features') }}
      </RouterLink>
      <RouterLink class="sp-layout__nav-link" to="/settings" active-class="sp-layout__nav-link--active">
        {{ t('nav.settings') }}
      </RouterLink>
      <RouterLink class="sp-layout__nav-link" to="/chat" active-class="sp-layout__nav-link--active" data-testid="nav-link-chat">
        {{ t('nav.chat') }}
      </RouterLink>
    </nav>

    <header v-if="$slots.header" class="sp-layout__header" data-testid="layout-main-header">
      <slot name="header" />
    </header>

    <main class="sp-layout__body" data-testid="layout-main-body">
      <ErrorBoundary>
        <slot />
      </ErrorBoundary>
    </main>

    <footer v-if="$slots.footer" class="sp-layout__footer" data-testid="layout-main-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.sp-layout--main {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.sp-layout__nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  padding: 0 0.5rem;
  flex-shrink: 0;
}

.sp-layout__nav-link {
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.sp-layout__nav-link:hover {
  color: var(--text-normal);
}

.sp-layout__nav-link--active {
  color: var(--text-normal);
  border-bottom-color: var(--interactive-accent);
}

.sp-layout__header {
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.sp-layout__body {
  flex: 1;
  overflow-y: auto;
}

.sp-layout__footer {
  flex-shrink: 0;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
}
</style>
