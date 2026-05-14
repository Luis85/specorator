<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { tryAsync } from '@/domain/shared/tryAsync'
import OnboardingPersonaCard from './OnboardingPersonaCard.vue'

const props = defineProps<{ initialValue: string }>()
const emit = defineEmits<{ next: [payload: { skipped: boolean }] }>()

const settingsPort = useSettingsPort()
const logger = useLoggerPort()

const EXAMPLE_CARDS = [
	"I'm a product manager at a mid-size SaaS company. I focus on roadmap planning and work closely with engineering and design.",
	"I'm a founder building a B2B tool. I wear many hats — from sales to product — and need to move quickly without losing sight of the big picture.",
	"I'm a business analyst at a financial services firm. I gather requirements, document processes, and bridge the gap between stakeholders and technical teams.",
]

const personaText = ref(props.initialValue)
let pristine = true
watch(() => props.initialValue, (val) => { if (pristine) personaText.value = val })
const isSaving = ref(false)
const saveError = ref<string | null>(null)

function markEdited(): void { pristine = false }

function useCard(text: string): void {
	personaText.value = text
	pristine = false
}

async function saveAndContinue(): Promise<void> {
	isSaving.value = true
	saveError.value = null
	const result = await tryAsync(async () => {
		const current = await settingsPort.getSettings()
		await settingsPort.saveSettings({ ...current, userPersona: personaText.value })
	}, 'Failed to save persona')
	isSaving.value = false
	if (!result.ok) {
		logger.error('Failed to save persona', result.error)
		saveError.value = "We couldn't save your introduction right now. Try again, or skip for now."
		return
	}
	emit('next', { skipped: personaText.value.trim() === '' })
}

function skipForNow(): void {
	if (isSaving.value) return
	emit('next', { skipped: true })
}
</script>

<template>
	<div class="sp-onboarding__step" data-testid="step2">
		<h2 class="sp-onboarding__heading">Tell us a little about yourself.</h2>
		<p class="sp-onboarding__body">
			A few sentences about your role and what you're working on helps Specorator give you more
			relevant suggestions. There's no right or wrong answer — just describe yourself as you would
			to a colleague.
		</p>

		<textarea
			v-model="personaText"
			class="sp-onboarding__textarea"
			aria-label="About you"
			@input="markEdited"
			placeholder="For example: I'm a product manager at a scale-up focusing on B2B growth. I spend most of my time on roadmap planning and stakeholder alignment."
			data-testid="step2-textarea"
		/>
		<p class="sp-onboarding__hint">Two to four sentences is plenty.</p>

		<div class="sp-onboarding__cards">
			<OnboardingPersonaCard
				v-for="(card, i) in EXAMPLE_CARDS"
				:key="i"
				:text="card"
				:data-testid="`step2-card-${i}`"
				@use="useCard"
			/>
		</div>

		<p
			v-if="saveError !== null"
			role="alert"
			aria-live="assertive"
			class="sp-onboarding__inline-error"
			data-testid="step2-save-error"
		>
			{{ saveError }}
		</p>

		<div class="sp-onboarding__actions">
			<button
				class="sp-btn sp-btn--primary sp-btn--md"
				:aria-label="isSaving ? 'Saving, please wait' : 'Save and continue'"
				:disabled="isSaving"
				data-testid="step2-continue"
				@click="saveAndContinue"
			>
				{{ isSaving ? 'Saving…' : 'Save and continue' }}
			</button>
			<button
				class="sp-onboarding__skip"
				data-testid="step2-skip"
				@click="skipForNow"
			>
				I'll do this later
			</button>
		</div>
	</div>
</template>

<style scoped>
.sp-onboarding__textarea {
	min-height: 7rem;
	resize: vertical;
	line-height: 1.6;
	width: 100%;
	padding: 0.5rem 0.75rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	background: var(--background-primary);
	color: var(--text-normal);
	font-size: 0.9375rem;
}

.sp-onboarding__hint {
	font-size: 0.875rem;
	color: var(--text-muted);
	margin: 0;
}

.sp-onboarding__cards {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-top: 0.25rem;
}

.sp-onboarding__inline-error {
	color: var(--text-error);
	font-size: 0.875rem;
	margin: 0;
}

.sp-onboarding__actions {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	align-items: flex-start;
}

.sp-onboarding__skip {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	color: var(--text-muted);
	font-size: 0.875rem;
	min-width: 24px;
	min-height: 24px;
}

.sp-onboarding__skip:disabled {
	opacity: 0.5;
	cursor: default;
}
</style>
