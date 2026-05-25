<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ComposerModeApi } from '@/ui/chat/composer/useComposerMode';
import type { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import type { BangBashOutput as BangBashOutputDto } from '@/application/chat/composer/SubmitBangBashUseCase';
import type { NotificationPort } from '@/domain/ports';
import ComposerDropdown from '@/ui/chat/composer/ComposerDropdown.vue';
import PlanModeIndicator from '@/ui/chat/composer/PlanModeIndicator.vue';
import BangBashOutput from '@/ui/chat/composer/BangBashOutput.vue';
import InlineAskUserQuestion from '@/ui/chat/composer/InlineAskUserQuestion.vue';
import InlineExitPlanMode from '@/ui/chat/composer/InlineExitPlanMode.vue';
import InlinePlanApproval from '@/ui/chat/composer/InlinePlanApproval.vue';

/**
 * The send-composer (SPEC-CC-021, extended P4 — SPEC-CP-019). A bordered rounded
 * wrapper containing a borderless, transparent, auto-growing textarea + a
 * send/stop control. Owns no chat state — `isStreaming` is a prop and the parent
 * wires `submit`/`cancel` to the store. Keyboard contract (REQ-CC-008): Enter
 * sends (not Shift, not IME, non-empty) and prevents the newline; Shift+Enter
 * inserts a newline; Esc while streaming requests cancel (REQ-CC-010). While
 * streaming the control is a stop button (EC-4); Enter never starts a second turn
 * while streaming.
 *
 * **P4 extension (SPEC-CP-019/031, ADDITIVE):** when a `composer` arbiter is
 * provided, the keydown handler FIRST calls `composer.handleKeydown(event)` and
 * only falls through to the unchanged P1 Enter/Shift+Enter/IME logic when it
 * returns `false` && `mode.kind==='default'` (REQ-CP-035). The textarea gains the
 * combobox ARIA wiring + the mode-border classes (instruction/bang-bash/plan).
 * `inline-block` mode `v-if`-hides the textarea+toolbar and renders the active
 * inline block sibling, restored after the last resolves (REQ-CP-027); bang-bash
 * mode switches to monospace + a run-command placeholder. With no `composer` prop
 * the component is pure P1 (the send path byte-identical). No `obsidian` import.
 */
const props = defineProps<{
	isStreaming: boolean;
	/** The composer-mode arbiter (SPEC-CP-018). When absent → pure P1. */
	composer?: ComposerModeApi;
	/** The inline-block response boundary (SPEC-CP-017) — required when blocks render. */
	respond?: RespondToInlineBlockUseCase;
	/** Read for the inline blocks' capability gate (SPEC-CP-032). */
	supportsInlineResponse?: boolean;
	/** Surfaces the inline blocks' read-only notice (EC-CP-6). */
	notify?: NotificationPort;
	/** A completed bang-bash run rendered as an output block (SPEC-CP-025). */
	bangBashOutput?: BangBashOutputDto | null;
}>();
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

// ── P4 composer-power extension (SPEC-CP-019/031) ───────────────────────────────

const mode = computed(() => props.composer?.mode.value ?? { kind: 'default', planActive: false });
const isPalette = computed(
	() => mode.value.kind === 'slash' || mode.value.kind === 'skills' || mode.value.kind === 'mention',
);
const paletteMode = computed<'slash' | 'skills' | 'mention'>(() =>
	isPalette.value ? (mode.value.kind as 'slash' | 'skills' | 'mention') : 'slash',
);
const activeBlock = computed(() => props.composer?.activeInlineBlock.value ?? null);
const inlineActive = computed(() => mode.value.kind === 'inline-block' && activeBlock.value !== null);
const isBangBash = computed(() => mode.value.kind === 'bang-bash');
const isInstruction = computed(() => mode.value.kind === 'instruction');

const placeholder = computed(() =>
	isBangBash.value
		? t('agent.chat.composer.bash.placeholder')
		: isInstruction.value
		  ? t('agent.chat.composer.instruction.placeholder')
		  : t('agent.chat.composer.placeholder'),
);

const composerClasses = computed(() => ({
	'sp-chat-composer--plan': mode.value.planActive,
	'sp-chat-composer--bang-bash': isBangBash.value,
	'sp-chat-composer--instruction': isInstruction.value,
	'sp-chat-composer--mono': isBangBash.value,
}));

/** The caret index for the arbiter's pure trigger-parse (SPEC-CP-012). */
function caret(): number {
	return textarea.value?.selectionStart ?? value.value.length;
}

/** Re-classify the composer mode on every input change (REQ-CP-034). */
function onInput(): void {
	autoGrow();
	props.composer?.handleInput(value.value, caret());
}

/**
 * The P4 keydown gate (SPEC-CP-019, REQ-CP-035): the arbiter consumes
 * palette/inline/plan keys FIRST; the P1 send fires only when it did NOT consume
 * the event AND the mode is `default`. With no arbiter the P1 logic runs directly.
 */
function onComposerKeydown(event: KeyboardEvent): void {
	if (props.composer === undefined) {
		onKeydown(event);
		return;
	}
	const handled = props.composer.handleKeydown(event);
	if (handled) return;
	if (mode.value.kind === 'instruction' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
		event.preventDefault();
		void submitInstruction();
		return;
	}
	if (mode.value.kind !== 'default') return;
	onKeydown(event);
}

/** Submit the instruction-mode body through the arbiter ladder, then clear. */
async function submitInstruction(): Promise<void> {
	const raw = value.value.replace(/^\s*#/, '').trim();
	await props.composer?.submitInstruction(raw);
	value.value = '';
	void nextTick(() => {
		autoGrow();
		focusTextarea();
	});
}

function onPaletteConfirm(index: number): void {
	void props.composer?.confirmEntry(index);
	void nextTick(() => {
		value.value = textarea.value?.value ?? value.value;
		focusTextarea();
	});
}

function onPaletteClose(): void {
	// Escape already cleared the palette via the arbiter's handleKeydown; refocus.
	focusTextarea();
}

function onBlockResolved(): void {
	props.composer?.resolveInlineBlock();
	void nextTick(focusTextarea);
}
</script>

<template>
	<div class="sp-chat-composer" :class="composerClasses" data-testid="chat-composer">
		<template v-if="inlineActive && activeBlock !== null">
			<InlineAskUserQuestion
				v-if="activeBlock.kind === 'ask_user_question' && respond !== undefined && notify !== undefined"
				:request="activeBlock.request"
				:respond="respond"
				:supports-inline-response="supportsInlineResponse ?? false"
				:notify="notify"
				@resolve="onBlockResolved"
			/>
			<InlineExitPlanMode
				v-else-if="activeBlock.kind === 'exit_plan_mode' && respond !== undefined && notify !== undefined"
				:request="activeBlock.request"
				:respond="respond"
				:supports-inline-response="supportsInlineResponse ?? false"
				:notify="notify"
				@resolve="onBlockResolved"
			/>
			<InlinePlanApproval
				v-else-if="activeBlock.kind === 'approval_request' && respond !== undefined && notify !== undefined"
				:request="activeBlock.request"
				:respond="respond"
				:supports-inline-response="supportsInlineResponse ?? false"
				:notify="notify"
				@resolve="onBlockResolved"
			/>
		</template>

		<template v-else>
			<PlanModeIndicator :active="mode.planActive" />

			<ComposerDropdown
				v-if="composer !== undefined && isPalette"
				:entries="composer.paletteEntries.value"
				:mode="paletteMode"
				@confirm="onPaletteConfirm"
				@close="onPaletteClose"
			/>

			<textarea
				ref="textarea"
				v-model="value"
				class="sp-chat-composer__textarea"
				data-testid="composer-textarea"
				:placeholder="placeholder"
				:style="{ height: textareaHeight }"
				rows="1"
				role="combobox"
				:aria-expanded="composer !== undefined && isPalette ? 'true' : 'false'"
				@input="onInput"
				@keydown="onComposerKeydown"
			/>

			<BangBashOutput
				v-if="bangBashOutput !== undefined && bangBashOutput !== null"
				:output="bangBashOutput"
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
		</template>
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

.sp-chat-composer--plan {
	border-color: var(--sp-plan-border);
}

.sp-chat-composer--instruction {
	border-color: var(--sp-instruction-border);
}

.sp-chat-composer--bang-bash {
	border-color: var(--sp-bash-border);
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

.sp-chat-composer--mono .sp-chat-composer__textarea {
	font-family: var(--sp-font-mono);
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
