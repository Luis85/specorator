<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'secondary', size: 'md', disabled: false, loading: false },
)

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    :class="[
      'sp-btn',
      `sp-btn--${variant}`,
      `sp-btn--${size}`,
      { 'sp-btn--loading': loading },
    ]"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="sp-btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.sp-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.sp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sp-btn--sm { padding: 0.25rem 0.625rem; font-size: 0.8rem; }
.sp-btn--md { padding: 0.4rem 0.875rem; }

.sp-btn--primary {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}
.sp-btn--primary:hover:not(:disabled) { opacity: 0.88; }

.sp-btn--secondary {
  background: var(--background-modifier-border);
  color: var(--text-normal);
}
.sp-btn--secondary:hover:not(:disabled) { background: var(--background-modifier-hover); }

.sp-btn--ghost {
  background: transparent;
  color: var(--text-muted);
}
.sp-btn--ghost:hover:not(:disabled) { background: var(--background-modifier-hover); color: var(--text-normal); }

.sp-btn--danger {
  background: transparent;
  color: var(--text-error);
  border-color: var(--text-error);
}
.sp-btn--danger:hover:not(:disabled) { background: var(--text-error); color: #fff; }

.sp-btn__spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
