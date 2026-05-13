<script setup lang="ts">
const emit = defineEmits<{ next: [] }>()
</script>
<template>
	<div data-testid="step1-placeholder">
		<button data-testid="step1-cta" @click="emit('next')">Let's get started</button>
	</div>
</template>
