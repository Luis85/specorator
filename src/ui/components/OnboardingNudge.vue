<script setup lang="ts">
defineProps<{
	message: string
	actionLabel?: string
	dismissible?: boolean
}>()

const emit = defineEmits<{
	action: []
	dismiss: []
}>()
</script>

<template>
	<aside role="note" class="sp-onboarding__nudge" data-testid="onboarding-nudge">
		<div class="sp-onboarding__nudge-body">
			{{ message }}
			<button
				v-if="actionLabel"
				class="sp-onboarding__nudge-action"
				data-testid="nudge-action"
				@click="emit('action')"
			>
				{{ actionLabel }}
			</button>
		</div>
		<button
			v-if="dismissible"
			class="sp-onboarding__nudge-dismiss"
			aria-label="Dismiss this suggestion"
			data-testid="nudge-dismiss"
			@click="emit('dismiss')"
		>
			×
		</button>
	</aside>
</template>

<style scoped>
.sp-onboarding__nudge {
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	padding: 0.75rem;
	font-size: 0.875rem;
	color: var(--text-muted);
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
}

.sp-onboarding__nudge-body {
	flex: 1;
	line-height: 1.5;
}

.sp-onboarding__nudge-action {
	background: none;
	border: none;
	padding: 0;
	margin-left: 0.25rem;
	cursor: pointer;
	color: var(--interactive-accent);
	text-decoration: underline;
	font-size: inherit;
	min-width: 24px;
	min-height: 24px;
}

.sp-onboarding__nudge-dismiss {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	color: var(--text-muted);
	font-size: 1rem;
	line-height: 1;
	flex-shrink: 0;
	min-width: 24px;
	min-height: 24px;
}
</style>
