<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * The send-composer (SPEC-CC-021). A bordered rounded wrapper containing a
 * borderless, transparent, auto-growing textarea + a send/stop control. Owns no
 * chat state — `isStreaming` is a prop and the parent wires `submit`/`cancel` to
 * the store. Keyboard contract (REQ-CC-008): Enter sends (not Shift, not IME,
 * non-empty) and prevents the newline; Shift+Enter inserts a newline; Esc while
 * streaming requests cancel (REQ-CC-010). While streaming the control is a stop
 * button (EC-4); Enter never starts a second turn while streaming.
 */
const props = defineProps<{ isStreaming: boolean }>();
const emit = defineEmits<{ submit: [text: string]; cancel: [] }>();

const { t } = useI18n();

const value = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);
// Auto-grow height is bound through Vue's `:style` (not a direct `element.style`
// write) so the obsidianmd no-static-styles rule stays satisfied. `auto` lets the
// textarea collapse to its scrollHeight on the next measure.
const textareaHeight = ref<string>('auto');

const canSubmit = computed(() => !props.isStreaming && value.value.trim().length > 0);

function autoGrow(): void {
	const el = textarea.value;
	if (el === null) return;
	textareaHeight.value = 'auto';
	void nextTick(() => {
		const measured = textarea.value;
		if (measured !== null) textareaHeight.value = `${measured.scrollHeight}px`;
	});
}

function focusTextarea(): void {
	textarea.value?.focus();
}

function submitTurn(): void {
	if (!canSubmit.value) return;
	emit('submit', value.value);
	value.value = '';
	void nextTick(() => {
		autoGrow();
		focusTextarea();
	});
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		if (props.isStreaming) emit('cancel');
		return;
	}
	if (event.key !== 'Enter') return;
	// Shift+Enter inserts a newline (EC-3); Enter during IME composition is the
	// commit key, not a send (EC-2).
	if (event.shiftKey || event.isComposing) return;
	// Empty/whitespace or streaming → no submit (EC-1, EC-4). Prevent the newline
	// only when we actually send.
	if (!canSubmit.value) return;
	event.preventDefault();
	submitTurn();
}

function onControlClick(): void {
	if (props.isStreaming) {
		emit('cancel');
		return;
	}
	submitTurn();
}

// Re-focus when a turn finalises (streaming → idle), per a11y §A.7.
watch(
	() => props.isStreaming,
	(streaming, was) => {
		if (was && !streaming) void nextTick(focusTextarea);
	},
);

onMounted(() => {
	autoGrow();
	focusTextarea();
});
</script>

<template>
	<div class="sp-chat-composer" data-testid="chat-composer">
		<textarea
			ref="textarea"
			v-model="value"
			class="sp-chat-composer__textarea"
			data-testid="composer-textarea"
			:placeholder="t('agent.chat.composer.placeholder')"
			:style="{ height: textareaHeight }"
			rows="1"
			@input="autoGrow"
			@keydown="onKeydown"
		/>
		<div class="sp-chat-composer__toolbar">
			<button
				type="button"
				class="sp-chat-composer__send"
				data-testid="composer-send"
				:disabled="!isStreaming && !canSubmit"
				:aria-label="isStreaming ? t('agent.chat.composer.stop') : t('agent.chat.composer.send')"
				@click="onControlClick"
			>
				<span aria-hidden="true">{{ isStreaming ? '◼' : '↑' }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
.sp-chat-composer {
	display: flex;
	flex-direction: column;
	min-block-size: var(--sp-input-min-h);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-primary);
	padding: var(--sp-space-3);
}

.sp-chat-composer__textarea {
	flex: 1;
	border: none;
	background: transparent;
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-base);
	line-height: var(--sp-line-height-normal);
	resize: none;
	min-block-size: var(--sp-textarea-min-h);
	max-block-size: var(--sp-textarea-max-h);
	outline: none;
}

.sp-chat-composer__toolbar {
	display: flex;
	justify-content: flex-end;
	padding-block-start: var(--sp-space-2);
}

.sp-chat-composer__send {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 28px;
	block-size: 28px;
	border: none;
	border-radius: var(--sp-radius-full);
	background: var(--sp-accent);
	color: var(--sp-text-on-accent);
	cursor: pointer;
}

.sp-chat-composer__send:disabled {
	opacity: 0.4;
	cursor: default;
}
</style>
