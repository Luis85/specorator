<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import OnboardingStepIndicator from './OnboardingStepIndicator.vue'
import OnboardingStep1Welcome from './OnboardingStep1Welcome.vue'
import OnboardingStep2Persona from './OnboardingStep2Persona.vue'
import OnboardingStep3ClaudeCheck from './OnboardingStep3ClaudeCheck.vue'
import OnboardingStep4Workspace from './OnboardingStep4Workspace.vue'
import OnboardingStep5Done from './OnboardingStep5Done.vue'

type ClaudeStatus = 'ready' | 'not-ready' | 'unknown'
type TemplateStatus = 'installed' | 'skipped' | 'failed'
interface Step2Payload { skipped: boolean }
interface Step3Payload { claudeStatus: ClaudeStatus }
interface Step4Payload { templateStatus: TemplateStatus; specsFolder: string }

const settingsPort = useSettingsPort()
const router = useRouter()

const TOTAL_STEPS = 5
const currentStep = ref(1)
const settings = ref<PluginSettings | null>(null)

const personaSkipped = ref(false)
const claudeStatus = ref<ClaudeStatus>('unknown')
const templateStatus = ref<TemplateStatus>('skipped')
const specsFolder = ref('specs')

const stepComponents = [
	OnboardingStep1Welcome,
	OnboardingStep2Persona,
	OnboardingStep3ClaudeCheck,
	OnboardingStep4Workspace,
	OnboardingStep5Done,
]

const currentStepComponent = computed(() => stepComponents[currentStep.value - 1])

const stepProps = computed(() => {
	switch (currentStep.value) {
		case 2: return { initialValue: settings.value?.userPersona ?? '' }
		case 4: return { initialSpecsFolder: specsFolder.value }
		case 5: return { personaSkipped: personaSkipped.value, claudeStatus: claudeStatus.value, templateStatus: templateStatus.value }
		default: return {}
	}
})

onMounted(async () => {
	const s = await settingsPort.getSettings()
	settings.value = s
	specsFolder.value = s.specsFolder
	if (!s.onboardingComplete) {
		void router.push('/onboarding')
	}
})

function applyStep2(payload: unknown): void {
	if (payload !== null && typeof payload === 'object' && 'skipped' in payload) {
		personaSkipped.value = (payload as Step2Payload).skipped
	}
}

function applyStep3(payload: unknown): void {
	if (payload !== null && typeof payload === 'object' && 'claudeStatus' in payload) {
		claudeStatus.value = (payload as Step3Payload).claudeStatus
	}
}

function applyStep4(payload: unknown): void {
	if (payload !== null && typeof payload === 'object' && 'templateStatus' in payload) {
		const p = payload as Step4Payload
		templateStatus.value = p.templateStatus
		specsFolder.value = p.specsFolder
	}
}

function handleNext(payload?: unknown): void {
	const stepHandlers: Partial<Record<number, (p: unknown) => void>> = {
		2: applyStep2,
		3: applyStep3,
		4: applyStep4,
	}
	stepHandlers[currentStep.value]?.(payload)
	if (currentStep.value < TOTAL_STEPS) {
		currentStep.value++
	}
}

function handleFinish(): void {
	void router.push('/')
}
</script>

<template>
	<div class="sp-onboarding" data-testid="onboarding-wizard">
		<OnboardingStepIndicator :current="currentStep" :total="TOTAL_STEPS" />
		<div class="sp-onboarding__step">
			<component
				:is="currentStepComponent"
				v-bind="stepProps"
				@next="handleNext"
				@finish="handleFinish"
			/>
		</div>
	</div>
</template>

<style scoped>
.sp-onboarding {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem 1rem;
  height: 100%;
}

.sp-onboarding__step {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
