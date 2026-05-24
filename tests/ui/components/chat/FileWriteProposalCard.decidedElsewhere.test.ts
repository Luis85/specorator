/**
 * T-MHP-120 — FileWriteProposalCard cross-surface S24 (decided-elsewhere).
 *
 * Spec: Part B §S24 + Part A §F3 cross-surface invariant; RISK-MHP-011.
 * Satisfies REQ-MHP-046; covers EC-MHP-033.
 *
 * Contract under test (S24 — additive, NOT a fifth render state):
 *   - When the card mounts with a terminal status (`accepted` | `rejected`)
 *     and a non-empty `decidedClient` prop, the existing terminal body still
 *     renders AND a new `<p data-testid="proposal-card-decided-elsewhere">`
 *     appears with the i18n copy `chat.proposal.decidedElsewhereBody` →
 *     `Decided in {client}.`.
 *   - When status is `pending`, the note is NOT rendered even if
 *     `decidedClient` is set — terminal-only.
 *   - Accept/Reject buttons are gone in the terminal state (existing
 *     behaviour preserved).
 *   - When status is `accepted` / `rejected` WITHOUT `decidedClient`, the
 *     note is absent (legacy callers unaffected).
 *   - Empty `decidedClient` is treated as absent (no note).
 *   - The decided-elsewhere note is muted+italic per design Part B
 *     §"Cross-surface decided-elsewhere note" — asserted via testid presence
 *     and class application (CSS-class assertion via classes() — exempt from
 *     ADR-009 query rule because the testid still locates the element).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileWriteProposalCard from '@/ui/components/chat/FileWriteProposalCard.vue'
import type { FileWriteProposal, FileWriteProposalStatus } from '@/application/chat/FileWriteProposal'
import { FileWriteProposalCardPO } from './FileWriteProposalCard.po'

function makeProposal(status: FileWriteProposalStatus = 'pending'): FileWriteProposal {
  return {
    proposalId: 'prop-test-S24',
    threadId: 'thread-S24',
    envelope: {
      action: 'createFile',
      path: 'specs/foo/idea.md',
      content: '# hi\n',
    },
    status,
    proposedAt: '2026-05-24T10:00:00.000Z',
    decidedAt: status === 'pending' ? null : '2026-05-24T10:00:01.000Z',
    failureReason: null,
    originPrompt: '/create-file specs/foo/idea.md',
  }
}

function mountCard(
  status: FileWriteProposalStatus,
  decidedClient: string | null | undefined,
) {
  const wrapper = mount(FileWriteProposalCard, {
    props: {
      proposal: makeProposal(status),
      pathValidationError: null,
      decidedClient,
    },
    attachTo: document.body,
  })
  return { wrapper, po: new FileWriteProposalCardPO(wrapper) }
}

function decidedElsewhereEl(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('[data-testid="proposal-card-decided-elsewhere"]')
}

describe('T-MHP-120 — FileWriteProposalCard S24 decided-elsewhere note (REQ-MHP-046)', () => {
  it('renders the decided-elsewhere note in accepted terminal state when decidedClient is set', () => {
    const { wrapper, po } = mountCard('accepted', 'cursor')
    expect(po.hasAcceptedBody()).toBe(true)
    const note = decidedElsewhereEl(wrapper)
    expect(note.exists()).toBe(true)
    expect(note.text()).toBe('Decided in cursor.')
  })

  it('renders the decided-elsewhere note in rejected terminal state when decidedClient is set', () => {
    const { wrapper, po } = mountCard('rejected', 'claude-desktop')
    expect(po.hasRejectedBody()).toBe(true)
    const note = decidedElsewhereEl(wrapper)
    expect(note.exists()).toBe(true)
    expect(note.text()).toBe('Decided in claude-desktop.')
  })

  it('keeps Accept/Reject buttons hidden in the externally-decided accepted state', () => {
    const { po } = mountCard('accepted', 'cursor')
    expect(po.hasAccept()).toBe(false)
    expect(po.hasReject()).toBe(false)
  })

  it('keeps Accept/Reject buttons hidden in the externally-decided rejected state', () => {
    const { po } = mountCard('rejected', 'cursor')
    expect(po.hasAccept()).toBe(false)
    expect(po.hasReject()).toBe(false)
  })

  it('does NOT render the note when status is pending (terminal-only)', () => {
    const { wrapper, po } = mountCard('pending', 'cursor')
    expect(po.hasAccept()).toBe(true) // pending state intact
    expect(decidedElsewhereEl(wrapper).exists()).toBe(false)
  })

  it('does NOT render the note when decidedClient is absent (legacy callers unaffected)', () => {
    const { wrapper } = mountCard('accepted', undefined)
    expect(decidedElsewhereEl(wrapper).exists()).toBe(false)
  })

  it('does NOT render the note when decidedClient is null', () => {
    const { wrapper } = mountCard('accepted', null)
    expect(decidedElsewhereEl(wrapper).exists()).toBe(false)
  })

  it('treats empty-string decidedClient as absent (no note)', () => {
    const { wrapper } = mountCard('accepted', '')
    expect(decidedElsewhereEl(wrapper).exists()).toBe(false)
  })

  it('falls back to `unknown` interpolation when an "unknown" client decided', () => {
    const { wrapper } = mountCard('rejected', 'unknown')
    const note = decidedElsewhereEl(wrapper)
    expect(note.exists()).toBe(true)
    expect(note.text()).toBe('Decided in unknown.')
  })

  it('renders the decided-elsewhere note as a muted, italic paragraph', () => {
    const { wrapper } = mountCard('accepted', 'cursor')
    const note = decidedElsewhereEl(wrapper)
    expect(note.exists()).toBe(true)
    expect(note.classes()).toContain('sp-proposal-card__decided-elsewhere')
  })
})
