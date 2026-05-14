<script setup lang="ts">
const props = defineProps<{ text: string }>()
const emit = defineEmits<{ use: [text: string] }>()
</script>

<template>
	<button
		class="sp-onboarding__card"
		:aria-label="`Use this example: ${props.text}`"
		data-testid="persona-card"
		@click="emit('use', props.text)"
	>
		{{ props.text }}
	</button>
</template>

<style scoped>
.sp-onboarding__card {
	border-radius: 6px;
	padding: 0.75rem 0.875rem;
	cursor: pointer;
	text-align: left;
	font-size: 0.875rem;
	color: var(--text-normal);
	width: 100%;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary);
	transition: background 0.15s;
}

.sp-onboarding__card:hover {
	background: var(--background-modifier-hover);
}
</style>
