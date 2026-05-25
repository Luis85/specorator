<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BangBashOutput } from '@/application/chat/composer/SubmitBangBashUseCase';

/**
 * Bang-bash output block (SPEC-CP-025, REQ-CP-031). Renders a `BangBashOutput`
 * DTO (SPEC-CP-016) as a read-only tool-like block: the command, monospace
 * stdout + stderr, a non-zero exit-code badge, and the `notice` (timeout /
 * truncated) when present. Content is `{{ }}` text only — Vue escapes by
 * construction, so a `<script>` in the output renders VERBATIM AS TEXT and is
 * never executed (EC-CP-13, NFR-CP-003, SPEC-CP-030). NO `v-html`; colour rides
 * the `--sp-bash-*` tokens (SPEC-CP-029); no `obsidian` import.
 */
const props = defineProps<{ output: BangBashOutput }>();

const { t } = useI18n();

const nonZero = computed(() => props.output.exitCode !== 0);
const hasStderr = computed(() => props.output.stderr !== '');
const hasNotice = computed(
	() => props.output.notice !== undefined && props.output.notice !== '',
);
</script>

<template>
	<div class="sp-bang-bash-output" data-testid="bang-bash-output">
		<div class="sp-bang-bash-output__header">
			<span
				class="sp-bang-bash-output__command"
				data-testid="bang-bash-output-command"
			>{{ output.command }}</span>
			<span
				v-if="nonZero"
				class="sp-bang-bash-output__exit"
				data-testid="bang-bash-output-exit"
			>{{ t('agent.chat.composer.bash.exitLabel') }} {{ output.exitCode }}</span>
		</div>

		<pre
			v-if="output.stdout !== ''"
			class="sp-bang-bash-output__stream"
			data-testid="bang-bash-output-stdout"
		>{{ output.stdout }}</pre>

		<pre
			v-if="hasStderr"
			class="sp-bang-bash-output__stream sp-bang-bash-output__stream--err"
			data-testid="bang-bash-output-stderr"
		>{{ output.stderr }}</pre>

		<div
			v-if="hasNotice"
			class="sp-bang-bash-output__notice"
			data-testid="bang-bash-output-notice"
			role="note"
		>{{ output.notice }}</div>
	</div>
</template>

<style scoped>
.sp-bang-bash-output {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	border: 1px solid var(--sp-bash-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bash-output-bg);
	padding: var(--sp-space-2);
}

.sp-bang-bash-output__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--sp-space-2);
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
}

.sp-bang-bash-output__command {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-bang-bash-output__exit {
	flex: 0 0 auto;
	padding-inline: var(--sp-space-2);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bash-border);
	color: var(--sp-text-on-accent);
}

.sp-bang-bash-output__stream {
	margin: 0;
	max-block-size: var(--sp-dropdown-max-h);
	overflow: auto;
	white-space: pre-wrap;
	word-break: break-word;
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-normal);
}

.sp-bang-bash-output__stream--err {
	color: var(--sp-text-muted);
}

.sp-bang-bash-output__notice {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
