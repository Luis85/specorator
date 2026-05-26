<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ComposerModeApi } from '@/ui/chat/composer/useComposerMode';
import type { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import type { BangBashOutput as BangBashOutputDto } from '@/application/chat/composer/SubmitBangBashUseCase';
import type { NotificationPort } from '@/domain/ports';
import type { AttachedFileRef, AttachedImage, CapturedSelection } from '@/domain/chat/attachments';
import ComposerDropdown from '@/ui/chat/composer/ComposerDropdown.vue';
import PlanModeIndicator from '@/ui/chat/composer/PlanModeIndicator.vue';
import BangBashOutput from '@/ui/chat/composer/BangBashOutput.vue';
import InlineAskUserQuestion from '@/ui/chat/composer/InlineAskUserQuestion.vue';
import InlineExitPlanMode from '@/ui/chat/composer/InlineExitPlanMode.vue';
import InlinePlanApproval from '@/ui/chat/composer/InlinePlanApproval.vue';
import FileChips from '@/ui/chat/FileChips.vue';
import ImageContextBar from '@/ui/chat/ImageContextBar.vue';
import SelectionIndicator from '@/ui/chat/SelectionIndicator.vue';
import ToolbarStrip from '@/ui/chat/toolbar/ToolbarStrip.vue';
import type { ToolbarViewModel } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { McpViewModel } from '@/application/chat/mcp/buildMcpViewModel';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import type { PermissionMode } from '@/domain/chat/PermissionMode';

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
 *
 * **P5 extension (SPEC-CA-022, ADDITIVE):** an optional context-bar region ABOVE
 * the textarea hosts `FileChips` + `ImageContextBar` + `SelectionIndicator` when
 * their props are non-empty; the composer re-emits the children's
 * `removeFile`/`openFile`/`removeImage`/`previewImage`/`clearSelection` to the
 * parent (which owns the store sets, ADR-CA-001 §2). With ALL three empty the bar
 * is hidden → the composer renders exactly as P4 (G2).
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
	/** P5 (SPEC-CA-022): the attached-file context set (the parent owns it). */
	attachedFiles?: readonly AttachedFileRef[];
	/** P5 (SPEC-CA-022): the image-context set. */
	images?: readonly AttachedImage[];
	/** P5 (SPEC-CA-022): the captured editor/canvas/browser selection. */
	capturedSelection?: CapturedSelection | null;
	/** P5 (SPEC-CA-021): the honest browser-capability flag for the gated affordance. */
	supportsBrowserSelection?: boolean;
	/** P5 (SPEC-CA-020): resolve a vault path → a display resource src (no `obsidian` here). */
	resolveThumbSrc?: (path: string) => string;
	/**
	 * P6 (SPEC-TC-021): the prebuilt toolbar view-model. When present an optional
	 * toolbar region renders `ToolbarStrip` between the textarea + the footer; when
	 * absent the composer is byte-identical to P5 (NFR-TC-001, EC-TC-14).
	 */
	toolbar?: ToolbarViewModel;
	/** P7 (SPEC-AS-012): the active tab's live permission mode for the toggle. */
	permissionMode?: PermissionMode;
	/**
	 * P8 (SPEC-MC-018/020): the manager-driven MCP view-model for the toolbar selector.
	 * When present the strip's selector lists the live servers + their enabled toggles;
	 * when absent (no MCP store) the strip keeps the P6 visible-empty seam (EC-MC-1).
	 */
	mcpVm?: McpViewModel;
}>();
const emit = defineEmits<{
	submit: [text: string];
	cancel: [];
	/** P5 re-emits (SPEC-CA-022) — the parent owns the store sets. */
	removeFile: [path: string];
	openFile: [path: string];
	removeImage: [path: string];
	previewImage: [image: AttachedImage];
	clearSelection: [];
	/** P5 (SPEC-CA-022): files dropped onto or pasted into the composer; the parent gates them. */
	attachFiles: [files: File[]];
	/** P5 (SPEC-CA-022): the paperclip control — the parent opens the picker via the seam. */
	attach: [];
	/** P6 (SPEC-TC-021): the four backed toolbar changes re-emitted to the parent. */
	'pick-model': [id: string];
	'set-mode': [value: string];
	'set-reasoning': [choice: ReasoningChoice];
	'toggle-service-tier': [active: boolean];
	/** P7 (SPEC-AS-012): the live permission-mode change re-emitted to the surface. */
	'set-permission': [mode: PermissionMode];
	/** P8 (SPEC-MC-018): the MCP selector's per-server enabled toggle re-emitted to the surface. */
	'set-mcp-enabled': [name: string, enabled: boolean];
}>();

const { t } = useI18n();

const value = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);
// Auto-grow height is bound through Vue's `:style` (not a direct `element.style`
// write) so the obsidianmd no-static-styles rule stays satisfied. `auto` lets the
// textarea collapse to its scrollHeight on the next measure.
const textareaHeight = ref<string>('auto');

const canSubmit = computed(() => !props.isStreaming && value.value.trim().length > 0);

// ── P5 context-bar gate (SPEC-CA-022) ────────────────────────────────────────────
const hasFiles = computed(() => (props.attachedFiles?.length ?? 0) > 0);
const hasImages = computed(() => (props.images?.length ?? 0) > 0);
const hasSelection = computed(() => (props.capturedSelection ?? null) !== null);
/** The bar is hidden when all three context sets are empty → byte-identical to P4 (G2). */
const hasContext = computed(() => hasFiles.value || hasImages.value || hasSelection.value);

// ── P5 drop / paste (SPEC-CA-022, REQ-CA-007) ────────────────────────────────────
// Files dropped onto / pasted into the composer are emitted to the parent, which
// gates each (image → the 8 MiB/MIME gate, non-image → a file chip). The composer
// only marshals the DOM events; it never imports `obsidian` and never reads bytes.

/** A drop carrying files → emit them; prevent the browser's default file-open. */
function onDrop(event: DragEvent): void {
	const files = event.dataTransfer?.files;
	if (files === undefined || files.length === 0) return;
	event.preventDefault();
	emit('attachFiles', Array.from(files));
}

/** Allow a drop over the composer (without this the browser blocks the `drop`). */
function onDragOver(event: DragEvent): void {
	event.preventDefault();
}

/** A paste carrying files (e.g. a clipboard image) → emit them; prevent the default insert. */
function onPaste(event: ClipboardEvent): void {
	const files = event.clipboardData?.files;
	if (files === undefined || files.length === 0) return;
	event.preventDefault();
	emit('attachFiles', Array.from(files));
}

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
	void nextTick(focusTextarea);
}

// ── Arbiter bridge (SPEC-CP-018) ────────────────────────────────────────────────
// The externally-built arbiter (provided by `ChatSurface`) reads/writes the
// composer text through these handles so the textarea stays the single source of
// truth (the arbiter holds only plain DTOs, NFR-CP-005). `applyInsert` rewrites the
// value + caret after a palette confirm / token replace (SPEC-CP-012).
function applyInsert(next: string, caret: number): void {
	value.value = next;
	void nextTick(() => {
		autoGrow();
		const el = textarea.value;
		if (el !== null) el.setSelectionRange(caret, caret);
		focusTextarea();
	});
}

defineExpose({
	getValue: (): string => value.value,
	getCaret: caret,
	applyInsert,
});

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
	<div
		class="sp-chat-composer"
		:class="composerClasses"
		data-testid="chat-composer"
		@drop="onDrop"
		@dragover="onDragOver"
	>
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

			<div v-if="hasContext" class="sp-chat-composer__context" data-testid="composer-context-bar">
				<FileChips
					v-if="hasFiles && attachedFiles"
					:files="attachedFiles"
					@remove="emit('removeFile', $event)"
					@open="emit('openFile', $event)"
				/>
				<ImageContextBar
					v-if="hasImages && images && resolveThumbSrc"
					:images="images"
					:resolve-thumb-src="resolveThumbSrc"
					@remove="emit('removeImage', $event)"
					@preview="emit('previewImage', $event)"
				/>
				<SelectionIndicator
					v-if="hasSelection"
					:selection="capturedSelection ?? null"
					:supports-browser-selection="supportsBrowserSelection ?? false"
					@clear="emit('clearSelection')"
				/>
			</div>

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
				@paste="onPaste"
			/>

			<BangBashOutput
				v-if="bangBashOutput !== undefined && bangBashOutput !== null"
				:output="bangBashOutput"
			/>

			<div v-if="toolbar !== undefined" class="sp-chat-composer__controls" data-testid="composer-toolbar">
				<ToolbarStrip
					:vm="toolbar"
					:notify="notify"
					:permission-mode="permissionMode"
					:mcp-vm="mcpVm"
					@pick-model="emit('pick-model', $event)"
					@set-mode="emit('set-mode', $event)"
					@set-reasoning="emit('set-reasoning', $event)"
					@toggle-service-tier="emit('toggle-service-tier', $event)"
					@set-permission="emit('set-permission', $event)"
					@set-mcp-enabled="(name, enabled) => emit('set-mcp-enabled', name, enabled)"
				/>
			</div>

			<div class="sp-chat-composer__toolbar">
				<button
					type="button"
					class="sp-chat-composer__attach"
					data-testid="composer-attach"
					:aria-label="t('agent.chat.context.attach')"
					@click="emit('attach')"
				>
					<span aria-hidden="true">📎</span>
				</button>
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

.sp-chat-composer__context {
	display: flex;
	flex-direction: column;
	gap: var(--sp-context-bar-gap);
	padding-block-end: var(--sp-space-2);
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

.sp-chat-composer__controls {
	padding-block-start: var(--sp-space-2);
}

.sp-chat-composer__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding-block-start: var(--sp-space-2);
}

.sp-chat-composer__attach {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 28px;
	block-size: 28px;
	border: none;
	border-radius: var(--sp-radius-full);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
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
