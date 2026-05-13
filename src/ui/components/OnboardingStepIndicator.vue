<script setup lang="ts">
defineProps<{
	current: number
	total: number
}>()
</script>

<template>
	<p
		class="sp-onboarding__step-indicator"
		:aria-label="`Step ${current} of ${total}`"
		data-testid="step-indicator"
	>
		Step {{ current }} of {{ total }}
	</p>
</template>

<style scoped>
.sp-onboarding__step-indicator {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin: 0;
}
</style>
