<script setup lang="ts">
defineProps<{ initialSpecsFolder: string }>()
const emit = defineEmits<{ next: [payload: { templateStatus: 'installed' | 'skipped' | 'failed'; specsFolder: string }] }>()
</script>
<template>
	<div data-testid="step4-placeholder">
		<button data-testid="step4-skip-btn" @click="emit('next', { templateStatus: 'skipped', specsFolder: 'specs' })">Skip</button>
	</div>
</template>
