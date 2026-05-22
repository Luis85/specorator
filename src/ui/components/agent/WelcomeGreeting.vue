<script setup lang="ts">
/**
 * `WelcomeGreeting.vue` — empty-thread welcome surface (spec §1.3.5).
 * Centred serif greeting whose variant is computed from the current local
 * hour. Renders a row of `WelcomeSuggestionChip`s; clicking a chip emits
 * `suggestion-pick` so the parent can pre-fill the composer.
 *
 * Satisfies: REQ-AUX-007.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import WelcomeSuggestionChip from './WelcomeSuggestionChip.vue'

type SuggestionId =
	| 'feature'
	| 'tasks'
	| 'file'
	| 'slash'
	| 'mention'
	| 'send'
	| 'escape'

interface WelcomeSuggestion {
	id: SuggestionId
	prefillText?: string
}

interface WelcomeGreetingProps {
	suggestions?: ReadonlyArray<WelcomeSuggestion>
	/**
	 * Override the current hour for deterministic test runs. When omitted the
	 * component reads `new Date().getHours()` on render.
	 */
	hourOverride?: number
}
const props = withDefaults(defineProps<WelcomeGreetingProps>(), {
	suggestions: () => [
		{ id: 'slash' },
		{ id: 'mention' },
		{ id: 'send' },
		{ id: 'escape' },
	],
})

const emit = defineEmits<{
	'suggestion-pick': [payload: { id: SuggestionId }]
}>()

const { t } = useI18n()

type TimeBand = 'morning' | 'afternoon' | 'evening' | 'night'

function bandForHour(hour: number): TimeBand {
	if (hour >= 5 && hour <= 11) return 'morning'
	if (hour >= 12 && hour <= 17) return 'afternoon'
	if (hour >= 18 && hour <= 22) return 'evening'
	return 'night'
}

const band = computed<TimeBand>(() =>
	bandForHour(props.hourOverride ?? new Date().getHours()),
)

const greeting = computed(() => t(`welcome.greeting.${band.value}`))

function handlePick(payload: { id: string }): void {
	emit('suggestion-pick', { id: payload.id as SuggestionId })
}
</script>

<template>
	<section
		class="sp-welcome"
		data-testid="welcome-greeting"
		:data-time-band="band"
	>
		<h2 class="sp-welcome__greeting" data-testid="welcome-greeting-title">
			{{ greeting }}
		</h2>
		<p class="sp-welcome__subtitle" data-testid="welcome-greeting-subtitle">
			{{ t('welcome.subtitle') }}
		</p>
		<div
			class="sp-welcome__suggestions"
			data-testid="welcome-greeting-suggestions"
		>
			<WelcomeSuggestionChip
				v-for="s in suggestions"
				:key="s.id"
				:id="s.id"
				:label="t(`welcome.suggestion.${s.id}`)"
				@pick="handlePick"
			/>
		</div>
	</section>
</template>

<style scoped>
.sp-welcome {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	padding-block: 2.5rem;
	padding-inline: 1.25rem;
	text-align: center;
}

.sp-welcome__greeting {
	margin: 0;
	font-family: var(--sp-font-serif);
	font-weight: 500;
	font-size: 1.75rem;
	line-height: var(--sp-line-height-tight, 1.2);
	color: var(--text-normal);
}

.sp-welcome__subtitle {
	margin: 0;
	font-size: 0.875rem;
	color: var(--text-muted);
}

.sp-welcome__suggestions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.5rem;
	margin-block-start: 0.5rem;
}
</style>
