<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
	<div class="specorator-agent-panel" data-testid="agent-panel-empty">
		<p>{{ t('agent.empty.placeholder') }}</p>
	</div>
</template>
