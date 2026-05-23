<script setup lang="ts">
/**
 * `WelcomeGreeting.vue` — empty-thread welcome surface (spec §1.3.5).
 * Centred serif greeting whose variant is computed from the current local
 * hour. Renders a row of `WelcomeSuggestionChip`s; clicking a chip emits
 * `suggestion-pick` with the chip id AND the full prompt text so the
 * parent can pre-fill the composer textarea (QW-D — vault-investigation
 * prompts replacing the legacy hint chips).
 *
 * Satisfies: REQ-AUX-007.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import WelcomeSuggestionChip from './WelcomeSuggestionChip.vue'

type SuggestionId =
	| 'findOrphans'
	| 'summarizeActive'
	| 'projectsTag'
	| 'brokenLinks'

interface WelcomeSuggestion {
	id: SuggestionId
	icon: string
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
		{ id: 'findOrphans', icon: 'unplug' },
		{ id: 'summarizeActive', icon: 'file-text' },
		{ id: 'projectsTag', icon: 'hash' },
		{ id: 'brokenLinks', icon: 'link-2-off' },
	],
})

const emit = defineEmits<{
	'suggestion-pick': [payload: { id: SuggestionId; prompt: string }]
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
	const id = payload.id as SuggestionId
	emit('suggestion-pick', {
		id,
		prompt: t(`welcome.chips.${id}.prompt`),
	})
}
</script>

<template>
	<section
		class="sp-welcome"
		data-testid="welcome-greeting"
		:data-time-band="band"
	>
		<div
			class="sp-welcome__greeting-group"
			data-testid="welcome-greeting-group"
		>
			<h2 class="sp-welcome__greeting" data-testid="welcome-greeting-title">
				{{ greeting }}
			</h2>
			<p class="sp-welcome__subtitle" data-testid="welcome-greeting-subtitle">
				{{ t('welcome.subtitle') }}
			</p>
		</div>
		<div
			class="sp-welcome__suggestions"
			data-testid="welcome-greeting-suggestions"
		>
			<WelcomeSuggestionChip
				v-for="s in suggestions"
				:key="s.id"
				:id="s.id"
				:label="t(`welcome.chips.${s.id}.label`)"
				:icon="s.icon"
				@pick="handlePick"
			/>
		</div>
	</section>
</template>

<style scoped>
/*
 * G3 (RALPH AUX): the greeting now FILLS the empty transcript area so it
 * reads like Claudian's "What's new?" canvas. Layout is a 3-row grid:
 *   row 1: top spacer (1fr)
 *   row 2: greeting-group (serif title + subtitle), vertically centered
 *   row 3: spacer that pushes chips ~80% down (1fr)
 *   row 4: suggestion chip row (auto, bottom-anchored)
 * The MessageList wrapper stretches us to the full empty-transcript
 * height; the grid is what actually centres the greeting.
 */
.sp-welcome {
	display: grid;
	grid-template-rows: 1fr auto 1fr auto;
	justify-items: center;
	inline-size: 100%;
	block-size: 100%;
	padding-block: 1.5rem;
	padding-inline: 1.25rem;
	text-align: center;
}

.sp-welcome__greeting-group {
	grid-row: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.sp-welcome__greeting {
	margin: 0;
	font-family: var(--sp-font-serif);
	font-weight: 500;
	font-size: 1.75rem;
	line-height: var(--sp-line-height-tight, 1.2);
	color: var(--sp-text-normal);
}

.sp-welcome__subtitle {
	margin: 0;
	font-size: 0.875rem;
	color: var(--sp-text-muted);
}

.sp-welcome__suggestions {
	grid-row: 4;
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.5rem;
	padding-block-end: 0.5rem;
}
</style>