<script setup lang="ts">
/**
 * T-MHP-124 — `AutoAcceptReceipt.vue` (Part B §S25, §S26).
 *
 * Satisfies REQ-MHP-009 (silent vault-append receipt) and REQ-MHP-043
 * (DevTools low-risk auto-accept receipt). Single presentational component;
 * one muted row inside the agent's chat bubble.
 *
 * Two variants:
 *   - kind: 'vault-append'        — `Appended to <code>{path}</code>.`
 *   - kind: 'devtools-low-risk'   — `Ran <code>{tool}</code>.`
 *
 * The i18n keys (`chat.autoAccept.vaultAppendBody`,
 * `chat.autoAccept.devtoolsLowRiskBody`) carry a `{path}` / `{tool}`
 * placeholder. The component substitutes a unique sentinel, splits the
 * resulting localised string around it, and renders the value inside a
 * `<code>` element with its own `data-testid` per design Part B §S26.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  kind: 'vault-append' | 'devtools-low-risk'
  path?: string
  tool?: string
}>()

interface Split { readonly before: string; readonly after: string }

const SENTINEL = 'AUTOACCEPT_VAR'

function splitAround(template: string, marker: string): Split {
  const idx = template.indexOf(marker)
  if (idx === -1) return { before: template, after: '' }
  return { before: template.slice(0, idx), after: template.slice(idx + marker.length) }
}

const isVaultAppend = computed(() => props.kind === 'vault-append')
const pathValue = computed(() => props.path ?? '')
const toolValue = computed(() => props.tool ?? '')
const regionAriaLabel = computed(() => t('chat.autoAccept.regionAriaLabel'))
const vaultAppendSplit = computed<Split>(() =>
  splitAround(t('chat.autoAccept.vaultAppendBody', { path: SENTINEL }), SENTINEL),
)
const devtoolsSplit = computed<Split>(() =>
  splitAround(t('chat.autoAccept.devtoolsLowRiskBody', { tool: SENTINEL }), SENTINEL),
)
</script>

<template>
  <p
    class="sp-auto-accept-receipt"
    data-testid="auto-accept-receipt"
    role="status"
    :aria-label="regionAriaLabel"
  >
    <template v-if="isVaultAppend">
      <span>{{ vaultAppendSplit.before }}</span><code data-testid="auto-accept-receipt-path">{{ pathValue }}</code><span>{{ vaultAppendSplit.after }}</span>
    </template>
    <template v-else>
      <span>{{ devtoolsSplit.before }}</span><code data-testid="auto-accept-receipt-tool">{{ toolValue }}</code><span>{{ devtoolsSplit.after }}</span>
    </template>
  </p>
</template>

<style scoped>
.sp-auto-accept-receipt {
  margin: 0.25rem 0;
  color: var(--text-muted);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.sp-auto-accept-receipt code {
  font-family: var(--font-monospace);
  font-size: 0.8125rem;
  padding: 0 0.125rem;
}
</style>
