<script setup lang="ts">
/**
 * FileWriteProposalCard — inline accept/reject card the user interacts with to
 * authorise a vault write proposed by the assistant.
 *
 * Satisfies SPEC-ASM-001 §7.4 (REQ-ASM-041, REQ-ASM-042, REQ-ASM-048, REQ-ASM-050,
 * NFR-ASM-007). Plain-language copy per DESIGN-ASM-001 §B3 / §A4.
 *
 * Render states (mutually exclusive, first match wins):
 *   any × pathValidationError !== null → 'path-invalid' (Accept button NOT rendered)
 *   'pending'                          → 'pending'
 *   'accepted'                         → 'accepted'
 *   'rejected'                         → 'rejected'
 *   'failed'                           → 'failed'
 *
 * Tab order (NFR-ASM-007): heading → show-more → accept → reject → retry.
 * Heading is `tabindex="-1"` and receives programmatic focus on mount.
 *
 * No `v-html` anywhere (XSS hygiene). Content preview is rendered with text
 * interpolation inside `<pre>`.
 */
import { computed, onMounted, ref } from 'vue'
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal'
import type { PathValidationError } from '@/application/chat/errors'

const props = defineProps<{
  proposal: FileWriteProposal
  pathValidationError: PathValidationError | null
}>()

const emit = defineEmits<{
  accept: [{ proposalId: string }]
  reject: [{ proposalId: string }]
  retry: [{ proposalId: string }]
}>()

const headingEl = ref<HTMLElement | null>(null)
const acceptButtonEl = ref<HTMLButtonElement | null>(null)
const rejectButtonEl = ref<HTMLButtonElement | null>(null)
const showFullContent = ref(false)

defineExpose({ headingEl, acceptButtonEl, rejectButtonEl })

type RenderState = 'path-invalid' | 'pending' | 'accepted' | 'rejected' | 'failed'

const renderState = computed<RenderState>(() => {
  if (props.pathValidationError !== null) return 'path-invalid'
  return props.proposal.status
})

const path = computed(() => props.proposal.envelope.path)
const content = computed(() => props.proposal.envelope.content)

const contentLines = computed(() => content.value.split('\n'))
const hasMoreThan40Lines = computed(() => contentLines.value.length > 40)

const previewText = computed(() => {
  if (showFullContent.value) return content.value
  return contentLines.value.slice(0, 40).join('\n')
})

const showsPreview = computed(
  () =>
    renderState.value === 'pending' ||
    renderState.value === 'accepted' ||
    renderState.value === 'rejected',
)

const showsRetry = computed(
  () =>
    renderState.value === 'pending' ||
    renderState.value === 'rejected' ||
    renderState.value === 'failed',
)

const acceptAriaLabel = computed(() => `Accept proposed file ${path.value}`)
const rejectAriaLabel = computed(() => `Reject proposed file ${path.value}`)
const retryAriaLabel = computed(() => `Generate another proposal for ${path.value}`)

function onAccept(): void {
  emit('accept', { proposalId: props.proposal.proposalId })
}

function onReject(): void {
  emit('reject', { proposalId: props.proposal.proposalId })
}

function onRetry(): void {
  emit('retry', { proposalId: props.proposal.proposalId })
}

function toggleShowMore(): void {
  showFullContent.value = !showFullContent.value
}

onMounted(() => {
  headingEl.value?.focus()
})
</script>

<template>
  <section
    class="sp-proposal-card"
    data-testid="proposal-card"
    role="region"
    aria-label="File creation proposal"
  >
    <h3
      ref="headingEl"
      class="sp-proposal-card__heading"
      data-testid="proposal-card-heading"
      tabindex="-1"
    >
      Proposed new file
    </h3>

    <p class="sp-proposal-card__path-row">
      <span class="sp-proposal-card__label">File:</span>
      <code data-testid="proposal-card-path">{{ path }}</code>
    </p>

    <template v-if="showsPreview">
      <p class="sp-proposal-card__label">Content</p>
      <pre
        class="sp-proposal-card__content"
        data-testid="proposal-card-content-preview"
      >{{ previewText }}</pre>
      <button
        v-if="hasMoreThan40Lines"
        type="button"
        class="sp-proposal-card__show-more"
        data-testid="proposal-card-show-more"

        @click="toggleShowMore"
      >
        {{ showFullContent ? 'Show preview' : 'Show full content' }}
      </button>
    </template>

    <div v-if="renderState === 'pending'" class="sp-proposal-card__actions">
      <button
        ref="acceptButtonEl"
        type="button"
        class="sp-proposal-card__accept"
        data-testid="proposal-card-accept"
        :aria-label="acceptAriaLabel"
        @click="onAccept"
      >
        Accept
      </button>
      <button
        ref="rejectButtonEl"
        type="button"
        class="sp-proposal-card__reject"
        data-testid="proposal-card-reject"
        :aria-label="rejectAriaLabel"
        @click="onReject"
      >
        Reject
      </button>
      <button
        v-if="showsRetry"
        type="button"
        class="sp-proposal-card__retry"
        data-testid="proposal-card-retry"
        :aria-label="retryAriaLabel"
        @click="onRetry"
      >
        Try again
      </button>
    </div>

    <p
      v-if="renderState === 'accepted'"
      class="sp-proposal-card__accepted-body"
      data-testid="proposal-card-accepted-body"
    >
      Saved to '{{ path }}'.
    </p>

    <template v-if="renderState === 'rejected'">
      <p
        class="sp-proposal-card__rejected-body"
        data-testid="proposal-card-rejected-body"
      >
        Discarded — no changes were made.
      </p>
      <button
        v-if="showsRetry"
        type="button"
        class="sp-proposal-card__retry"
        data-testid="proposal-card-retry"
        :aria-label="retryAriaLabel"
        @click="onRetry"
      >
        Try again
      </button>
    </template>

    <template v-if="renderState === 'failed'">
      <p
        class="sp-proposal-card__failed-body"
        data-testid="proposal-card-failed-body"
      >
        Could not save the file. Please try again.
      </p>
      <button
        v-if="showsRetry"
        type="button"
        class="sp-proposal-card__retry"
        data-testid="proposal-card-retry"
        :aria-label="retryAriaLabel"
        @click="onRetry"
      >
        Try again
      </button>
    </template>

    <p
      v-if="renderState === 'path-invalid'"
      class="sp-proposal-card__path-invalid"
      data-testid="proposal-card-path-invalid"
    >
      That path isn't valid for this vault.
    </p>
  </section>
</template>

<style scoped>
.sp-proposal-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  border-left: 4px solid var(--sp-proposal-accent, var(--interactive-accent));
  background: var(--background-secondary);
  border-radius: 0.25rem;
  font-family: var(--font-text);
  font-size: 0.875rem;
  line-height: 1.4;
}

.sp-proposal-card__heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  outline: none;
}

.sp-proposal-card__heading:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
}

.sp-proposal-card__path-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: baseline;
  margin: 0;
}

.sp-proposal-card__label {
  margin: 0;
  font-weight: 600;
  color: var(--text-muted);
}

.sp-proposal-card__content {
  max-height: 16rem;
  margin: 0;
  padding: 0.5rem;
  overflow: auto;
  background: var(--background-primary);
  border-radius: 0.25rem;
  font-family: var(--font-monospace);
  font-size: 0.8125rem;
  white-space: pre;
}

.sp-proposal-card__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.sp-proposal-card__accept,
.sp-proposal-card__reject,
.sp-proposal-card__retry,
.sp-proposal-card__show-more {
  padding: 0.375rem 0.875rem;
  border-radius: 0.25rem;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
}

.sp-proposal-card__accept {
  background: var(--sp-proposal-accent, var(--interactive-accent));
  color: var(--text-on-accent);
  border-color: transparent;
}

.sp-proposal-card__accepted-body,
.sp-proposal-card__rejected-body,
.sp-proposal-card__failed-body,
.sp-proposal-card__path-invalid {
  margin: 0;
  color: var(--text-muted);
}

.sp-proposal-card__path-invalid {
  color: var(--sp-proposal-warning, var(--text-warning, var(--text-muted)));
}
</style>
