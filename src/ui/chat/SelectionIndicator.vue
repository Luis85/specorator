<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CapturedSelection } from '@/domain/chat/attachments';

/**
 * The captured-selection indicator chip (SPEC-CA-021, REQ-CA-015/018). When a
 * `selection` is present, render a chip with a TEXT label (not colour alone —
 * NFR-CA-008) per `kind`: editor → note + line span; canvas → canvas + node
 * count; browser → `title ?? source`. A labelled clear control emits `clear`
 * (REQ-CA-015). The browser-capture affordance is GATED: it renders ONLY when
 * `supportsBrowserSelection` is `true` (an honest defer — no affordance, no
 * error otherwise, EC-CA-7, SPEC-CA-029). Keyboard-operable; no `obsidian`
 * import; no `v-html`; no `window.confirm`/`alert`/`prompt`.
 */
const props = defineProps<{
	selection: CapturedSelection | null;
	supportsBrowserSelection: boolean;
}>();
const emit = defineEmits<{ clear: [] }>();

const { t } = useI18n();

/** A human, text-only label for the captured selection (never colour-only). */
const label = computed<string>(() => {
	const sel = props.selection;
	if (sel === null) return '';
	switch (sel.kind) {
		case 'editor':
			return t('agent.chat.context.selection.editor', {
				notePath: sel.notePath,
				startLine: sel.startLine,
				lineCount: sel.lineCount,
			});
		case 'canvas':
			return t('agent.chat.context.selection.canvas', {
				canvasPath: sel.canvasPath,
				count: sel.nodeIds.length,
			});
		case 'browser':
			return sel.title ?? sel.source;
	}
	return '';
});
</script>

<template>
	<div
		v-if="selection !== null"
		class="sp-selection-indicator"
		data-testid="selection-indicator"
		role="group"
		:aria-label="t('agent.chat.context.selection.label')"
	>
		<span class="sp-selection-indicator__label" data-testid="selection-indicator-label" dir="auto">{{
			label
		}}</span>
		<button
			v-if="supportsBrowserSelection"
			type="button"
			class="sp-selection-indicator__browser"
			data-testid="selection-indicator-browser-capture"
			:aria-label="t('agent.chat.context.selection.browserCapture')"
		>
			<span aria-hidden="true">⧉</span>
		</button>
		<button
			type="button"
			class="sp-selection-indicator__clear"
			data-testid="selection-indicator-clear"
			:aria-label="t('agent.chat.context.selection.clear')"
			@click="emit('clear')"
		>
			<span aria-hidden="true">×</span>
		</button>
	</div>
</template>

<style scoped>
.sp-selection-indicator {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	border: 1px solid var(--sp-chip-border);
	border-radius: var(--sp-chip-radius);
	background: var(--sp-chip-bg);
	padding-inline: var(--sp-space-2);
	padding-block: var(--sp-space-1);
}

.sp-selection-indicator__label {
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-normal);
	unicode-bidi: plaintext;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-inline-size: 28ch;
}

.sp-selection-indicator__browser,
.sp-selection-indicator__clear {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
	line-height: 1;
}

.sp-selection-indicator__browser:hover,
.sp-selection-indicator__clear:hover {
	color: var(--sp-text-normal);
}
</style>
