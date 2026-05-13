<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import OnboardingNudge from './OnboardingNudge.vue'

const settingsPort = useSettingsPort()
const showNudge = ref(false)
const dismissed = ref(false)

onMounted(async () => {
	const settings = await settingsPort.getSettings()
	showNudge.value = settings.onboardingComplete && settings.userPersona === ''
})

function dismiss(): void {
	dismissed.value = true
}
</script>

<template>
	<OnboardingNudge
		v-if="showNudge && !dismissed"
		message="Tell Specorator about yourself so suggestions are more relevant to you."
		action-label="Add your introduction"
		:dismissible="true"
		data-testid="home-persona-nudge"
		@action="() => {}"
		@dismiss="dismiss"
	/>
</template>
