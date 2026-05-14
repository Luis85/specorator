<script setup lang="ts">
defineProps<{
	personaSkipped: boolean
	claudeStatus: 'ready' | 'not-ready' | 'unknown'
	templateStatus: 'installed' | 'skipped' | 'failed'
}>()
const emit = defineEmits<{ finish: [] }>()
</script>
<template>
	<div data-testid="step5-placeholder">
		<button data-testid="step5-cta" @click="emit('finish')">Start using Specorator</button>
	</div>
</template>
