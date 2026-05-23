<script setup lang="ts">
/**
 * Header for the dedicated agent sidepanel.
 *
 * G2 (RALPH G2) — Claudian-parity collapse: the header band is now just
 * the logo + wordmark. The "New conversation" affordance lives on the
 * floating nav column (G2.3); the "No feature in focus" caption is gone
 * (G2.1); the tab strip only mounts when the user has 2+ open threads
 * (G2.2). When a thread carries a feature slug we still render a small
 * caption beneath the band — this is the only non-logo row the spec
 * still allows.
 *
 * Provider + model selectors continue to live in the InputToolbar (WS-6).
 *
 * Satisfies REQ-AUX-003 plus the G2 parity goals from the WS-AUX dispatch
 * plan.
 *
 * Props the parent supplies:
 *   - `activeFeature`: current active thread's `feature` slug, or `null`.
 *
 * `hasActiveThread` / `requestInFlight` are still accepted for
 * call-site backwards compatibility but no longer drive any chrome.
 */
import { useI18n } from 'vue-i18n';
import SpIcon from '@/ui/components/primitives/SpIcon.vue';

withDefaults(
	defineProps<{
		/** Current active thread's `feature` slug, or `null` when no thread / no feature. */
		activeFeature: string | null;
		/** Retained for compat; the header no longer renders state for this. */
		hasActiveThread?: boolean;
		/** Retained for compat; the header no longer renders state for this. */
		requestInFlight?: boolean;
	}>(),
	{ hasActiveThread: false, requestInFlight: false },
);

const { t } = useI18n();
</script>

<template>
	<header class="sp-agent-header" data-testid="agent-header">
		<div class="sp-agent-header__band" data-testid="agent-header-band">
			<SpIcon
				name="sparkles"
				:size="16"
				class="sp-agent-header__logo"
				data-testid="agent-header-logo"
				aria-hidden="true"
			/>
			<span class="sp-agent-header__title" data-testid="agent-header-title">
				{{ t('agent.title') }}
			</span>
		</div>
		<!-- provider + model selectors moved to InputToolbar in WS-6 -->
		<!--
			G2.1 (RALPH G2): the "No feature in focus" caption is gone for
			Claudian parity. We only render the feature scope row when a
			thread is actually scoped to a feature; otherwise the header
			collapses to its logo+title band.
		-->
		<p
			v-if="activeFeature !== null"
			class="sp-agent-header__feature"
			data-testid="agent-header-feature"
		>
			{{ t('agent.featureScope', { slug: activeFeature }) }}
		</p>
		<!--
        SPEC-MPS-001 §A2 IA: `ThreadTabStrip` is mounted inside the header.
        Using a named slot keeps Header.vue agnostic of the strip's deps
        (chatTabCap from settings, store wiring); the root supplies the
        strip via `<template #tabStrip>` so unit tests that mount Header
        in isolation continue to render without store + settings setup.
      -->
		<div
			v-if="$slots.tabStrip"
			class="sp-agent-header__tab-strip-slot"
			data-testid="agent-header-tab-strip"
		>
			<slot name="tabStrip" />
		</div>
	</header>
</template>

<style scoped>
.sp-agent-header {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	padding-block: 0.25rem;
	padding-inline: 0.75rem;
	border-bottom: 1px solid var(--sp-border);
	background: var(--sp-bg-secondary);
	flex-shrink: 0;
}

.sp-agent-header__band {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	height: 36px;
}

.sp-agent-header__logo {
	color: var(--sp-brand);
	flex-shrink: 0;
}

.sp-agent-header__title {
	font-size: 0.9375rem;
	font-weight: 700;
	color: var(--sp-text-normal);
	letter-spacing: 0.01em;
}

.sp-agent-header__feature {
	margin: 0;
	font-size: 0.75rem;
	color: var(--sp-text-muted);
}

.sp-agent-header__tab-strip-slot {
	margin-top: 0.5rem;
}
</style>
