<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useMentionPicker } from '@/ui/composables/useMentionPicker'
import type { MentionCandidate } from '@/application/chat/vaultFileSearch'
import { basenameOf } from '@/application/chat/vaultFileSearch'
import MentionDropdown from './MentionDropdown.vue'

const props = defineProps<{
  modelValue: string
  disabled: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
  /**
   * Emitted alongside `update:modelValue` when the user accepts a mention
   * candidate. The consumer is responsible for invoking
   * `chatStore.addContextFile` so a context-file chip is created
   * (PR-ASV-4 / D-ASV-3 — the inline token and the chip travel together).
   */
  'add-context-file': [candidate: MentionCandidate]
}>()

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const vaultPort = useVaultPort()
const picker = useMentionPicker(vaultPort)

defineExpose({ textareaEl })

onBeforeUnmount(() => {
  // Cancel any pending debounce / discard in-flight scans so timer
  // callbacks do not fire against an unmounted reactive ref.
  picker.close()
})

/**
 * Tab / non-modifier Enter handler for the open picker — consume to
 * commit; otherwise let the caller treat the event normally. Split out
 * to keep `handlePickerKey` under the project's complexity budget.
 */
function tryCommitFromKey(event: KeyboardEvent): boolean {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return false
  const selection = picker.currentSelection()
  if (selection === null) return false
  event.preventDefault()
  commitMention(selection)
  return true
}

/**
 * Picker keyboard handler. Returns `true` if the event was consumed —
 * the caller skips its own send handling in that case. Kept as a
 * separate function so `handleKeydown` stays within the project's
 * complexity budget.
 */
function handlePickerKey(event: KeyboardEvent): boolean {
  // Codex P2 on PR #376: Escape must dismiss the picker even when the
  // result list is empty (zero matches OR a scan error cleared results).
  // The previous guard required BOTH `open` and `hasResults`, so users
  // were stranded with no keyboard way to leave mention mode until
  // blur or further text changes.
  if (!picker.open.value) return false
  if (event.key === 'Escape') {
    event.preventDefault()
    picker.close()
    return true
  }
  // Navigation and commit keys still require results to be useful.
  if (!picker.hasResults.value) return false
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    picker.moveSelectionDown()
    return true
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    picker.moveSelectionUp()
    return true
  }
  if (event.key === 'Tab' || event.key === 'Enter') {
    return tryCommitFromKey(event)
  }
  return false
}

function handleKeydown(event: KeyboardEvent): void {
  // IME-composition guard (top-4 from comparative review). `isComposing`
  // is `true` while a Japanese/Chinese/Korean IME is mid-composition;
  // pressing Enter to commit the composition must NOT trigger send /
  // commit-mention / dismiss-picker. `keyCode === 229` is the legacy IME
  // indicator for older browsers — defence in depth.
  if (event.isComposing || event.keyCode === 229) return
  if (handlePickerKey(event)) return
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    if (!props.disabled && !props.loading) {
      event.preventDefault()
      // Codex P2 on PR #376: close the mention picker before the send.
      // Without this, the dropdown stays mounted on a now-readonly
      // textarea during loading, and a subsequent Enter/Tab can commit
      // a mention mid-request and mutate `modelValue` / `contextFiles`
      // while the send is in flight — breaking the disabled-input
      // contract and leaving stale UI behind after submit.
      if (picker.open.value) picker.close()
      emit('send')
    }
  }
}

function handleInput(event: Event): void {
  const ta = event.target as HTMLTextAreaElement
  emit('update:modelValue', ta.value)
  picker.handleInput(ta.value, ta.selectionStart)
}

function commitMention(candidate: MentionCandidate): void {
  // Codex P2 on PR #376: replace the `@<query>` span using trigger
  // bounds, NOT the current caret. The picker may stay open while the
  // user moves the caret with ArrowLeft/ArrowRight; using
  // `ta.selectionStart` would slice the wrong suffix and leak the old
  // query (or unrelated text) into the prompt. `picker.atIndex` is the
  // `@`, and `picker.atIndex + 1 + picker.query.length` is the end of
  // the detected token at the time the picker last opened/updated.
  const at = picker.atIndex.value
  if (at < 0) {
    picker.close()
    return
  }
  const queryEnd = at + 1 + picker.query.value.length
  const before = props.modelValue.slice(0, at)
  const after = props.modelValue.slice(queryEnd)
  const token = `@${basenameOf(candidate.path)} `
  const next = `${before}${token}${after}`
  emit('update:modelValue', next)
  emit('add-context-file', candidate)
  picker.close()
  // Restore caret after the inserted token. Wrapped in a microtask
  // because the textarea value updates after the parent re-renders.
  void Promise.resolve().then(() => {
    const el = textareaEl.value
    if (el === null) return
    const pos = before.length + token.length
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

function onDropdownSelect(candidate: MentionCandidate): void {
  commitMention(candidate)
}

function onDropdownHover(index: number): void {
  picker.setSelectedIndex(index)
}
</script>

<template>
  <div class="sp-chat__input-area">
    <textarea
      ref="textareaEl"
      class="sp-chat__textarea"
      :value="modelValue"
      :readonly="disabled"
      :aria-label="'Message'"
      aria-multiline="true"
      :aria-expanded="picker.open.value"
      aria-autocomplete="list"
      :aria-controls="picker.open.value ? 'mention-dropdown' : undefined"
      placeholder="Ask anything about your work…"
      rows="3"
      data-testid="chat-input-textarea"
      @input="handleInput"
      @keydown="handleKeydown"
      @blur="picker.close()"
    />
    <MentionDropdown
      v-if="picker.open.value"
      id="mention-dropdown"
      :results="picker.results.value"
      :selected-index="picker.selectedIndex.value"
      @select="onDropdownSelect"
      @hover="onDropdownHover"
    />
    <div class="sp-chat__input-actions">
      <button
        type="button"
        class="sp-btn sp-btn--primary sp-btn--md"
        :disabled="disabled"
        aria-label="Send message"
        data-testid="chat-send-button"
        @click="!disabled && !loading && emit('send')"
      >
        <span v-if="loading" class="sp-btn__spinner" aria-hidden="true" />
        <span>{{ loading ? 'Asking…' : 'Ask' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sp-chat__input-area {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
