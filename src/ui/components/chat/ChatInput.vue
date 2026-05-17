<script setup lang="ts">
/**
 * Textarea + send-button input for the chat sidebar. Owns:
 *   - Slash-command palette trigger detection (PR-ASV-3, D-ASV-2)
 *   - @-mention picker trigger detection (PR-ASV-4, D-ASV-3)
 *
 * Both palettes share the textarea event wiring. Slash palette opens when
 * the caret is preceded by `/` either at position 0 or after whitespace.
 * Mention picker opens via `useMentionPicker.handleInput()`.
 */
import { computed, ref, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVaultPort } from '@/ui/composables/useVaultPort';
import { useMentionPicker } from '@/ui/composables/useMentionPicker';
import type { MentionCandidate } from '@/application/chat/vaultFileSearch';
import { basenameOf } from '@/application/chat/vaultFileSearch';
import MentionDropdown from './MentionDropdown.vue';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { useSlashPalette } from '@/ui/composables/useSlashPalette';
import SlashCommandDropdown from './SlashCommandDropdown.vue';

const props = defineProps<{
	modelValue: string;
	disabled: boolean;
	loading: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string];
	send: [];
	/**
	 * Emitted alongside `update:modelValue` when the user accepts a mention
	 * candidate. The consumer is responsible for invoking
	 * `chatStore.addContextFile` so a context-file chip is created
	 * (PR-ASV-4 / D-ASV-3 — the inline token and the chip travel together).
	 */
	'add-context-file': [candidate: MentionCandidate];
	'select-command': [command: SlashCommand];
	/** WP-7 A11y #5: Escape during loading=true → ChatSidebar aborts the turn. */
	abort: [];
}>();

const textareaEl = ref<HTMLTextAreaElement | null>(null);
const vaultPort = useVaultPort();
const picker = useMentionPicker(vaultPort);
const palette = useSlashPalette();
const { t } = useI18n();

// WP-7 A11y #3: shared combobox wiring for the textarea — both the slash
// palette and the @-mention picker resolve to the same ARIA attribute set.
// Slash command names can be vault-derived (spaces / dots / slashes) and must
// be slugged before they can be used in an HTML id that `aria-activedescendant`
// resolves through `getElementById`. SlashCommandDropdown uses the same helper.
import { slashCommandSlug } from './slashCommandSlug';
const currentPicker = computed<{ controls: string; activeDescendant?: string } | null>(() => {
	if (palette.isOpen.value) {
		const cmds = palette.matchedCommands.value;
		const idx = palette.selectedIndex.value;
		const name = idx >= 0 && idx < cmds.length ? cmds[idx]?.name : undefined;
		return {
			controls: 'slash-command-dropdown',
			activeDescendant: name !== undefined ? `slash-command-item-${slashCommandSlug(name)}` : undefined,
		};
	}
	if (picker.open.value) {
		const idx = picker.selectedIndex.value;
		const hasIdx = idx >= 0 && idx < picker.results.value.length;
		return {
			controls: 'mention-dropdown',
			activeDescendant: hasIdx ? `mention-item-${idx}` : undefined,
		};
	}
	return null;
});
const textareaAriaExpanded = computed(() => currentPicker.value !== null);
const textareaAriaControls = computed(() => currentPicker.value?.controls);
const textareaAriaActiveDescendant = computed(() => currentPicker.value?.activeDescendant);

defineExpose({ textareaEl, palette });

/**
 * Detect a `/` trigger by scanning backward from the caret. Returns the query
 * substring (everything after the `/`, no leading slash) when the trigger is
 * either at position 0 or preceded by whitespace; otherwise `null`.
 */
interface SlashTriggerMatch {
	/** Substring captured after the `/` up to the caret (no leading slash). */
	readonly query: string;
	/** Index of the `/` character in the textarea value. */
	readonly slashIndex: number;
	/** Caret position at the time of detection (end of the `/<query>` span). */
	readonly endIndex: number;
}

function detectSlashTrigger(value: string, caret: number): SlashTriggerMatch | null {
	if (caret < 1) return null;
	const prefix = value.slice(0, caret);
	const match = /(?:^|\s)\/([^\s]*)$/.exec(prefix);
	if (match === null) return null;
	const query = match[1];
	const slashIndex = caret - query.length - 1;
	return { query, slashIndex, endIndex: caret };
}

function syncPaletteFromTextarea(): void {
	const ta = textareaEl.value;
	if (ta === null) {
		palette.close();
		return;
	}
	const trigger = detectSlashTrigger(ta.value, ta.selectionStart);
	if (trigger === null) {
		if (palette.isOpen.value) palette.close();
		return;
	}
	if (palette.isOpen.value) {
		palette.setQuery(trigger.query);
	} else {
		palette.open(trigger.query);
	}
}

/**
 * Codex P2 on PR #375: clear the `/<query>` token from the textarea
 * before dispatching the command, so non-clearing commands like `/help`
 * and `/advance-stage` don't leave the literal slash text behind — the
 * next Ctrl/Cmd+Enter would otherwise send the command text to the model
 * as a regular prompt.
 *
 * Uses the trigger's own `slashIndex` + `endIndex` (NOT the current
 * caret) so the replacement stays correct even if the user moved the
 * caret with ArrowLeft/Right while the dropdown was open.
 */
function scrubSlashTrigger(): void {
	const ta = textareaEl.value;
	if (ta === null) return;
	// Codex P2 (third pass) on PR #375: use `selectionEnd`, NOT
	// `selectionStart`. When a selection exists (e.g. after Ctrl+A),
	// `selectionStart` is `0` while `selectionEnd` is the visual caret
	// end. The trigger detector slices the prefix up to its caret arg,
	// so `selectionStart = 0` made it return null and the scrub was a
	// no-op — `/help` + Ctrl+A + Enter left the slash text behind.
	// `selectionEnd` is the actual caret position both with and without
	// a selection, matching `selectionStart` when no range is active.
	const trigger = detectSlashTrigger(ta.value, ta.selectionEnd);
	if (trigger === null) return;
	// Codex P2 (second pass) on PR #375: `detectSlashTrigger` slices to the
	// CURRENT caret, but the user may have moved the caret left inside the
	// token (e.g. typed `/help`, ArrowLeft once, Enter). The trigger's
	// captured `endIndex` is the caret, not the end of the token — that
	// leaves trailing characters of `/<query>` behind after scrub. Walk
	// forward from `endIndex` through any non-whitespace characters to find
	// the true token end. Whitespace acts as the boundary because a
	// whitespace after `/` would have already aborted trigger detection.
	let tokenEnd = trigger.endIndex;
	while (tokenEnd < props.modelValue.length && !/\s/.test(props.modelValue[tokenEnd] ?? '')) {
		tokenEnd++;
	}
	const before = props.modelValue.slice(0, trigger.slashIndex);
	const after = props.modelValue.slice(tokenEnd);
	const next = `${before}${after}`;
	emit('update:modelValue', next);
	void Promise.resolve().then(() => {
		const el = textareaEl.value;
		if (el === null) return;
		const pos = before.length;
		el.focus();
		el.setSelectionRange(pos, pos);
	});
}

function handleSelectFromPalette(command: SlashCommand): void {
	scrubSlashTrigger();
	palette.close();
	emit('select-command', command);
	textareaEl.value?.focus();
}

function handleHighlight(index: number): void {
	const current = palette.selectedIndex.value;
	if (current === index) return;
	palette.navigate(index - current);
}

/**
 * Returns `true` when the keydown was consumed by the palette and the caller
 * should NOT fall through to send/keystroke handling.
 */
function handlePaletteKeydown(event: KeyboardEvent): boolean {
	if (!palette.isOpen.value) return false;
	if (event.key === 'ArrowDown') {
		event.preventDefault();
		palette.navigate(1);
		return true;
	}
	if (event.key === 'ArrowUp') {
		event.preventDefault();
		palette.navigate(-1);
		return true;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		palette.close();
		return true;
	}
	if (event.key === 'Enter' || event.key === 'Tab') {
		const command = palette.select();
		if (command !== null) {
			event.preventDefault();
			scrubSlashTrigger();
			palette.close();
			emit('select-command', command);
			return true;
		}
	}
	return false;
}

onBeforeUnmount(() => {
	// Cancel any pending debounce / discard in-flight scans so timer
	// callbacks do not fire against an unmounted reactive ref.
	picker.close();
});

/**
 * Tab / non-modifier Enter handler for the open picker — consume to commit.
 */
function tryCommitFromKey(event: KeyboardEvent): boolean {
	if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return false;
	const selection = picker.currentSelection();
	if (selection === null) return false;
	event.preventDefault();
	commitMention(selection);
	return true;
}

/**
 * Picker keyboard handler. Returns `true` if the event was consumed.
 */
function handlePickerKey(event: KeyboardEvent): boolean {
	if (!picker.open.value) return false;
	if (event.key === 'Escape') {
		event.preventDefault();
		picker.close();
		return true;
	}
	if (!picker.hasResults.value) return false;
	if (event.key === 'ArrowDown') {
		event.preventDefault();
		picker.moveSelectionDown();
		return true;
	}
	if (event.key === 'ArrowUp') {
		event.preventDefault();
		picker.moveSelectionUp();
		return true;
	}
	if (event.key === 'Tab' || event.key === 'Enter') {
		return tryCommitFromKey(event);
	}
	return false;
}

function tryHandleSendKey(event: KeyboardEvent): boolean {
	if (event.key !== 'Enter') return false;
	if (!(event.ctrlKey || event.metaKey)) return false;
	if (props.disabled || props.loading) return false;
	event.preventDefault();
	if (picker.open.value) picker.close();
	if (palette.isOpen.value) palette.close();
	emit('send');
	return true;
}

// WP-7 A11y #5: Escape during streaming aborts. The picker/palette branches
// consume Escape earlier in `handleKeydown`, so this only fires when neither
// is open and the parent component is loading=true.
function tryHandleAbortKey(event: KeyboardEvent): boolean {
	if (event.key !== 'Escape' || !props.loading) return false;
	event.preventDefault();
	emit('abort');
	return true;
}

function handleKeydown(event: KeyboardEvent): void {
	// IME-composition guard. `isComposing` is true while a Japanese/Chinese/
	// Korean IME is mid-composition; pressing Enter to commit must NOT
	// trigger send / commit-mention / dismiss-palette.
	if (event.isComposing || event.keyCode === 229) return;
	if (handlePickerKey(event)) return;
	if (handlePaletteKeydown(event)) return;
	if (tryHandleAbortKey(event)) return;
	tryHandleSendKey(event);
}

function handleInput(event: Event): void {
	const ta = event.target as HTMLTextAreaElement;
	emit('update:modelValue', ta.value);
	picker.handleInput(ta.value, ta.selectionStart);
	syncPaletteFromTextarea();
}

function handleClick(): void {
	syncPaletteFromTextarea();
}

function handleKeyup(event: KeyboardEvent): void {
	if (
		event.key === 'ArrowLeft' ||
		event.key === 'ArrowRight' ||
		event.key === 'Home' ||
		event.key === 'End'
	) {
		syncPaletteFromTextarea();
	}
}

function handleBlur(): void {
	if (palette.isOpen.value) palette.close();
	picker.close();
}

function commitMention(candidate: MentionCandidate): void {
	const at = picker.atIndex.value;
	if (at < 0) {
		picker.close();
		return;
	}
	const queryEnd = at + 1 + picker.query.value.length;
	const before = props.modelValue.slice(0, at);
	const after = props.modelValue.slice(queryEnd);
	// PR-ASV-4-folders: folders commit as `@<name>/` and don't emit a chip.
	const token =
		candidate.kind === 'folder'
			? `@${basenameOf(candidate.path)}/`
			: `@${basenameOf(candidate.path)} `;
	const next = `${before}${token}${after}`;
	emit('update:modelValue', next);
	if (candidate.kind === 'file') {
		emit('add-context-file', candidate);
	}
	picker.close();
	void Promise.resolve().then(() => {
		const el = textareaEl.value;
		if (el === null) return;
		const pos = before.length + token.length;
		el.focus();
		el.setSelectionRange(pos, pos);
	});
}

function onDropdownSelect(candidate: MentionCandidate): void {
	commitMention(candidate);
}

function onDropdownHover(index: number): void {
	picker.setSelectedIndex(index);
}
</script>

<template>
	<div class="sp-chat__input-area">
		<div class="sp-chat__input-wrapper">
			<SlashCommandDropdown
				v-if="palette.isOpen.value"
				:commands="palette.matchedCommands.value"
				:selected-index="palette.selectedIndex.value"
				@select="handleSelectFromPalette"
				@highlight="handleHighlight"
			/>
			<!-- WP-7 A11y #3: combobox attrs are shared between palette & picker. -->
			<textarea
				ref="textareaEl"
				class="sp-chat__textarea"
				:value="modelValue"
				:readonly="disabled"
				role="combobox"
				:aria-label="t('chat.inputAriaLabel')"
				aria-multiline="true"
				:aria-expanded="textareaAriaExpanded"
				aria-autocomplete="list"
				:aria-controls="textareaAriaControls"
				:aria-activedescendant="textareaAriaActiveDescendant"
				:placeholder="t('chat.inputPlaceholder')"
				rows="3"
				data-testid="chat-input-textarea"
				@input="handleInput"
				@keydown="handleKeydown"
				@keyup="handleKeyup"
				@click="handleClick"
				@blur="handleBlur"
			/>
			<MentionDropdown
				v-if="picker.open.value"
				id="mention-dropdown"
				:results="picker.results.value"
				:selected-index="picker.selectedIndex.value"
				@select="onDropdownSelect"
				@hover="onDropdownHover"
			/>
		</div>
		<div class="sp-chat__input-actions">
			<button
				type="button"
				class="sp-btn sp-btn--primary sp-btn--md"
				:disabled="disabled"
				:aria-label="t('chat.sendAriaLabel')"
				data-testid="chat-send-button"
				@click="!disabled && !loading && emit('send')"
			>
				<span v-if="loading" class="sp-btn__spinner" aria-hidden="true" />
				<span>{{ loading ? t('chat.sendLoading') : t('chat.sendIdle') }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
.sp-chat__input-area {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.sp-chat__input-wrapper {
	position: relative;
}

.sp-chat__textarea {
	width: 100%;
	min-height: 4.5rem;
	max-height: 8rem;
	resize: none;
	overflow-y: auto;
	padding: 0.4rem 0.75rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	background: var(--background-primary);
	color: var(--text-normal);
	font-family: var(--font-text);
	font-size: 0.875rem;
	box-sizing: border-box;
}

.sp-chat__textarea:focus {
	outline: none;
	border-color: var(--interactive-accent);
}

.sp-chat__input-actions {
	display: flex;
	justify-content: flex-end;
}
</style>
