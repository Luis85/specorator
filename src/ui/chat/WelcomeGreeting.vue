<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * The empty/welcome state (SPEC-CC-020, CLAR-CC-004). A centered, token-driven serif
 * greeting (`--sp-font-serif`, display size, light weight, muted) using the
 * brand-neutral `agent.chat.welcome.greeting` i18n key. No Claudian name/logo, and
 * NO "Baked for mm:ss" duration footer (dropped from P1). The parent (`ChatSurface`)
 * shows this only while the thread is empty.
 */
const { t } = useI18n();
</script>

<template>
	<div class="sp-chat-welcome" data-testid="chat-welcome">
		<p class="sp-chat-welcome__greeting">{{ t('agent.chat.welcome.greeting') }}</p>
	</div>
</template>

<style scoped>
.sp-chat-welcome {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	text-align: center;
}

.sp-chat-welcome__greeting {
	margin: 0;
	font-family: var(--sp-font-serif);
	font-size: var(--sp-font-size-display);
	font-weight: var(--sp-font-weight-light);
	color: var(--sp-text-muted);
}
</style>
