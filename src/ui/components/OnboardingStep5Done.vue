<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { tryAsync } from '@/domain/shared/tryAsync'
import OnboardingNudge from './OnboardingNudge.vue'

type ClaudeStatus = 'ready' | 'not-ready' | 'unknown'
type TemplateStatus = 'installed' | 'skipped' | 'failed'

const props = defineProps<{
	personaSkipped: boolean
	claudeStatus: ClaudeStatus
	templateStatus: TemplateStatus
}>()

const emit = defineEmits<{ finish: [] }>()

const router = useRouter()
const settingsPort = useSettingsPort()
const logger = useLoggerPort()

function goToSettings(): void {
	void router.push('/settings')
}

const saveError = ref<string | null>(null)

const allPositive = computed(
	() => !props.personaSkipped && props.claudeStatus === 'ready' && props.templateStatus === 'installed',
)

onMounted(async () => {
	const result = await tryAsync(async () => {
		const current = await settingsPort.getSettings()
		await settingsPort.saveSettings({ ...current, onboardingComplete: true })
	})
	if (!result.ok) {
		logger.error('Failed to save onboardingComplete', result.error)
		saveError.value =
			"We couldn't save your setup progress. Your changes are still applied for this session — please close and reopen Specorator to try again."
	}
})
</script>

<template>
	<div class="sp-onboarding__step" data-testid="step5">
		<h2 ref="headingRef" tabindex="-1" class="sp-onboarding__heading" data-testid="step5-heading">
			You're all set.
		</h2>

		<p v-if="saveError !== null" role="alert" class="sp-onboarding__save-error" data-testid="step5-save-error">
			{{ saveError }}
		</p>

		<p class="sp-onboarding__body" data-testid="step5-body">
			{{ allPositive
				? 'Specorator is ready to use. Here\'s a summary of what was set up.'
				: 'Specorator is ready to use. Here\'s a summary of what was set up — you can finish any remaining steps from settings at any time.' }}
		</p>

		<ul role="list" class="sp-onboarding__summary" data-testid="step5-summary">
			<li role="listitem" class="sp-onboarding__summary-item" data-testid="step5-summary-persona">
				<span class="sp-onboarding__summary-label">Introduction</span>
				<span
					:class="['sp-onboarding__summary-value', !personaSkipped && 'sp-onboarding__summary-value--positive']"
				>{{ personaSkipped ? 'Not added yet.' : 'Added.' }}</span>
			</li>
			<li role="listitem" class="sp-onboarding__summary-item" data-testid="step5-summary-claude">
				<span class="sp-onboarding__summary-label">AI assistant</span>
				<span
					:class="['sp-onboarding__summary-value', claudeStatus === 'ready' && 'sp-onboarding__summary-value--positive']"
				>
					<template v-if="claudeStatus === 'ready'">Ready.</template>
					<template v-else-if="claudeStatus === 'not-ready'">Not ready.</template>
					<template v-else>Status unknown.</template>
				</span>
			</li>
			<li role="listitem" class="sp-onboarding__summary-item" data-testid="step5-summary-templates">
				<span class="sp-onboarding__summary-label">Workflow templates</span>
				<span
					:class="['sp-onboarding__summary-value', templateStatus === 'installed' && 'sp-onboarding__summary-value--positive']"
				>
					<template v-if="templateStatus === 'installed'">Set up.</template>
					<template v-else-if="templateStatus === 'skipped'">Not installed.</template>
					<template v-else>Couldn't be installed.</template>
				</span>
			</li>
		</ul>

		<div class="sp-onboarding__nudges" data-testid="step5-nudge-persona">
			<OnboardingNudge
				v-if="personaSkipped"
				message="You can tell us about yourself any time — go to Settings and look for 'About you'."
				action-label="Add your introduction"
				@action="goToSettings"
			/>
		</div>

		<div data-testid="step5-nudge-claude">
			<OnboardingNudge
				v-if="claudeStatus === 'not-ready'"
				message="To unlock AI-powered suggestions, install Claude from claude.ai and restart Obsidian."
			/>
			<OnboardingNudge
				v-if="claudeStatus === 'unknown'"
				message="We couldn't check whether AI help is available. If you'd like AI suggestions, visit claude.ai to get started."
			/>
		</div>

		<button
			class="sp-btn sp-btn--primary sp-btn--md"
			data-testid="step5-cta"
			@click="emit('finish')"
		>
			Start using Specorator
		</button>
	</div>
</template>

<style scoped>
.sp-onboarding__summary {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.sp-onboarding__summary-item {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
	font-size: 0.9375rem;
	color: var(--text-normal);
}

.sp-onboarding__summary-label {
	font-weight: 600;
	min-width: 7rem;
}

.sp-onboarding__summary-value {
	color: var(--text-muted);
}

.sp-onboarding__summary-value--positive {
	color: var(--text-success, #4ade80);
}

.sp-onboarding__nudges {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.sp-onboarding__save-error {
	color: var(--text-error);
	font-size: 0.875rem;
	margin: 0;
}
</style>
