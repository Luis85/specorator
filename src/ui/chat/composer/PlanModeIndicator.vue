<script setup lang="ts">
/**
 * Plan-mode indicator (SPEC-CP-021, ADR-CP-004 §3 + ADR-CP-001). Renders the teal
 * **"PLAN"** label when `active` — the non-colour cue is the label TEXT (NFR-CP-008),
 * the colour rides the `--sp-plan-*` tokens (SPEC-CP-029). When not active it
 * renders nothing (honest gating: the toggle only flips `active` on a capable
 * runtime — `useComposerMode.handleKeydown` gates `Shift+Tab` on
 * `getCapabilities().supportsPlanMode`, SPEC-CP-032, never a provider branch).
 * `<script setup>`; label as `{{ }}` text — NO `v-html`; no `obsidian` import.
 */
defineProps<{ active: boolean }>();
</script>

<template>
	<span v-if="active" class="sp-plan-indicator" data-testid="plan-indicator">PLAN</span>
</template>

<style scoped>
.sp-plan-indicator {
	display: inline-flex;
	align-items: center;
	padding-inline: var(--sp-space-2);
	padding-block: var(--sp-space-1);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-plan-label-bg);
	color: var(--sp-text-on-accent);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-semibold);
	letter-spacing: 0.05em;
}
</style>
