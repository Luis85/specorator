<script setup lang="ts">
/**
 * Header for the dedicated agent sidepanel.
 *
 * WS-AUX-4 (T-AUX-201): collapses to a single 36 px band (logo+title+actions);
 * `ProviderBadge` + `ModelSelector` were relocated to the InputToolbar in WS-6.
 * The feature-scope hint is kept inline as a small caption beneath the band
 * because the spec contract is "no extra rows in the header" — the caption is
 * visually grouped with the title row (no border, no margin) so a screen
 * reader still announces "feature in focus" but layout reports one band.
 *
 * Satisfies REQ-AUX-003.
 */
import { useI18n } from 'vue-i18n';

const props = withDefaults(
	defineProps<{
		/** Current active thread's `feature` slug, or `null` when no thread / no feature. */
		activeFeature: string | null;
		/** Whether a thread is currently selected. */
		hasActiveThread: boolean;
		/**
		 * Whether a chat turn is currently in flight (`store.status === 'loading'`).
		 * Disables the new-conversation control so the user can't reset the thread
		 * mid-request and strand the in-flight response on a no-longer-active thread
		 * (Codex P1 finding, PR #369 second-pass review).
		 */
		requestInFlight?: boolean;
	}>(),
	{ requestInFlight: false },
);

const emit = defineEmits<{
	'new-conversation': [];
}>();

const { t } = useI18n();

function handleNewConversation(): void {
	emit('new-conversation');
}
</script>

<template>
	<header class="sp-agent-header" data-testid="agent-header">
		<div class="sp-agent-header__band" data-testid="agent-header-band">
			<span class="sp-agent-header__title" data-testid="agent-header-title">
				{{ t('agent.title') }}
			</span>
			<button
				type="button"
				class="sp-agent-header__action"
				data-testid="agent-header-new-conversation"
				:disabled="!props.hasActiveThread || props.requestInFlight"
				:aria-label="t('agent.newConversationAriaLabel')"
				@click="handleNewConversation"
			>
				{{ t('agent.newConversation') }}
			</button>
		</div>
		<!-- provider + model selectors moved to InputToolbar in WS-6 -->
		<p
			v-if="activeFeature !== null"
			class="sp-agent-header__feature"
			data-testid="agent-header-feature"
		>
			{{ t('agent.featureScope', { slug: activeFeature }) }}
		</p>
		<p
			v-else
			class="sp-agent-header__feature sp-agent-header__feature--muted"
			data-testid="agent-header-feature-empty"
		>
			{{ t('agent.noFeatureInFocus') }}
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
	background: var(--background-secondary);
	flex-shrink: 0;
}

.sp-agent-header__band {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 0.5rem;
	height: 36px;
}

.sp-agent-header__title {
	font-size: 0.9375rem;
	font-weight: 700;
	color: var(--text-normal);
	letter-spacing: 0.01em;
}

.sp-agent-header__action {
	font-size: 0.75rem;
	font-weight: 500;
	padding: 0.25rem 0.625rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-primary);
	color: var(--text-normal);
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s;
}

.sp-agent-header__action:hover:not(:disabled) {
	background: var(--interactive-hover);
}

.sp-agent-header__action:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.sp-agent-header__feature {
	margin: 0;
	font-size: 0.75rem;
	color: var(--text-muted);
}

.sp-agent-header__feature--muted {
	font-style: italic;
}

.sp-agent-header__tab-strip-slot {
	margin-top: 0.5rem;
}
</style>
