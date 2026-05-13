<script setup lang="ts">
const emit = defineEmits<{ next: [] }>()
</script>

<template>
	<div class="sp-onboarding__step" data-testid="step1">
		<h2 class="sp-onboarding__heading">Welcome to Specorator.</h2>
		<p class="sp-onboarding__body">
			Specorator helps you plan features, run structured workflows, and get relevant AI suggestions
			— all inside Obsidian. This short setup takes about two minutes and gets you to a working
			state straightaway.
		</p>
		<button
			class="sp-btn sp-btn--primary sp-btn--md"
			data-testid="step1-cta"
			@click="emit('next')"
		>
			Let's get started
		</button>
	</div>
</template>
