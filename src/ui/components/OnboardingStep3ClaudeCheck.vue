<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChatTransportPort } from '@/ui/composables/useChatTransportPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { tryAsync } from '@/domain/shared/tryAsync'

type ClaudeStatus = 'checking' | 'ready' | 'not-ready' | 'unknown'

const emit = defineEmits<{ next: [payload: { claudeStatus: 'ready' | 'not-ready' | 'unknown' }] }>()

const claudeCliPort = useChatTransportPort()
const logger = useLoggerPort()

const status = ref<ClaudeStatus>('checking')

onMounted(async () => {
	if (claudeCliPort === undefined) {
		status.value = 'unknown'
		return
	}
	const result = await tryAsync(
		() => claudeCliPort.isAvailable(),
		'ChatTransportPort.isAvailable() threw unexpectedly',
	)
	if (!result.ok) {
		logger.error('ChatTransportPort.isAvailable() threw unexpectedly', result.error)
		status.value = 'unknown'
	} else {
		status.value = result.value ? 'ready' : 'not-ready'
	}
	logger.debug('Claude CLI check resolved', { status: status.value })
})

function proceed(): void {
	emit('next', { claudeStatus: status.value === 'checking' ? 'unknown' : status.value })
}
</script>

<template>
	<div class="sp-onboarding__step" data-testid="step3">
		<h2 class="sp-onboarding__heading">Checking your AI assistant.</h2>

		<div
			role="status"
			aria-live="polite"
			class="sp-onboarding__status-region"
			data-testid="step3-status-region"
		>
			<span v-if="status === 'checking'" class="sp-onboarding__spinner" aria-label="Loading" />

			<p class="sp-onboarding__status-message" data-testid="step3-status-message">
				<template v-if="status === 'checking'">Checking your AI assistant…</template>
				<template v-else-if="status === 'ready'">Your AI assistant is ready.</template>
				<template v-else-if="status === 'not-ready'">To get AI help, you'll need Claude installed.</template>
				<template v-else>We couldn't check your AI assistant status right now. You can continue and check this later.</template>
			</p>

			<p v-if="status === 'not-ready'" class="sp-onboarding__status-sub" data-testid="step3-status-sub">
				Claude is a free AI assistant made by Anthropic. Visit claude.ai to download it and follow
				the setup instructions. Once it's installed, restart Obsidian and your AI suggestions will
				be active.
			</p>
		</div>

		<button
			v-if="status !== 'checking'"
			class="sp-btn sp-btn--primary sp-btn--md"
			data-testid="step3-continue"
			@click="proceed"
		>
			Continue
		</button>
	</div>
</template>

<style scoped>
.sp-onboarding__status-region {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 1rem;
	background: var(--background-secondary);
	border-radius: 8px;
	border: 1px solid var(--background-modifier-border);
}

.sp-onboarding__status-message {
	font-size: 0.9375rem;
	color: var(--text-normal);
	margin: 0;
}

.sp-onboarding__status-sub {
	font-size: 0.875rem;
	color: var(--text-muted);
	margin: 0;
	line-height: 1.5;
}

.sp-onboarding__spinner {
	display: inline-block;
	width: 1rem;
	height: 1rem;
	border: 2px solid var(--background-modifier-border);
	border-top-color: var(--interactive-accent);
	border-radius: 50%;
	animation: sp-spin 0.7s linear infinite;
}

@keyframes sp-spin {
	to { transform: rotate(360deg); }
}
</style>
