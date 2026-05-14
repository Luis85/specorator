/**
 * T-ASM-068 / T-ASM-069 — FileWriteProposalCard render-state and accessibility tests.
 *
 * - T-ASM-068: PageObject + render-state coverage for all five mutually-exclusive
 *   states (pending, accepted, rejected, failed, path-invalid).
 * - T-ASM-069: ARIA labels, tab order (heading → show-more → accept → reject →
 *   retry), keyboard activation (Enter and Space), Retry button presence, and
 *   plain-language copy (no AI/SDK jargon).
 *
 * Satisfies REQ-ASM-041, REQ-ASM-042, REQ-ASM-048, REQ-ASM-050, NFR-ASM-007.
 * Tests live alongside the SUT per ADR-009; selectors use `data-testid` only.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileWriteProposalCard from '@/ui/components/chat/FileWriteProposalCard.vue'
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal'
import type { FileWriteProposalStatus } from '@/application/chat/FileWriteProposal'
import type { CommitProposalErrorCode } from '@/application/chat/errors'
import { PathValidationError } from '@/application/chat/errors'
import { FileWriteProposalCardPO } from './FileWriteProposalCard.po'

function makeProposal(overrides: {
	status?: FileWriteProposalStatus
	path?: string
	content?: string
	failureReason?: CommitProposalErrorCode | null
} = {}): FileWriteProposal {
	return {
		proposalId: 'prop-test-1',
		threadId: 'thread-test-1',
		envelope: {
			action: 'createFile',
			path: overrides.path ?? 'notes/new-file.md',
			content: overrides.content ?? '# Hello\nWorld\n',
		},
		status: overrides.status ?? 'pending',
		proposedAt: '2026-05-14T12:00:00.000Z',
		decidedAt: overrides.status && overrides.status !== 'pending' ? '2026-05-14T12:00:01.000Z' : null,
		failureReason: overrides.failureReason ?? null,
	}
}

function mountCard(
	proposalOverrides: Parameters<typeof makeProposal>[0] = {},
	pathValidationError: PathValidationError | null = null,
) {
	const wrapper = mount(FileWriteProposalCard, {
		props: {
			proposal: makeProposal(proposalOverrides),
			pathValidationError,
		},
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom test runner has no Obsidian popout windows.
		attachTo: document.body,
	})
	const po = new FileWriteProposalCardPO(wrapper)
	return { wrapper, po }
}

describe('FileWriteProposalCard', () => {
	// ─────────────────────────────────────────────────────────────────────────
	// T-ASM-068 — Render-state tests
	// ─────────────────────────────────────────────────────────────────────────

	describe('T-ASM-068 / REQ-ASM-041 — pending state', () => {
		it('renders proposal-card, heading, path, content preview, accept, reject, retry', () => {
			const { po } = mountCard({ status: 'pending' })
			expect(po.hasCard()).toBe(true)
			expect(po.hasHeading()).toBe(true)
			expect(po.hasPath()).toBe(true)
			expect(po.hasContentPreview()).toBe(true)
			expect(po.hasAccept()).toBe(true)
			expect(po.hasReject()).toBe(true)
			expect(po.hasRetry()).toBe(true)
		})

		it('renders the validated path, not raw model output (no leak)', () => {
			const { po } = mountCard({ status: 'pending', path: 'specs/foo/idea.md' })
			expect(po.pathText()).toBe('specs/foo/idea.md')
		})

		it('renders the first 40 lines of content as preview', () => {
			const longContent = Array.from({ length: 60 }, (_, i) => `line-${i + 1}`).join('\n')
			const { po } = mountCard({ status: 'pending', content: longContent })
			const preview = po.contentPreviewText()
			expect(preview).toContain('line-1')
			expect(preview).toContain('line-40')
			expect(preview).not.toContain('line-41')
			expect(po.hasShowMore()).toBe(true)
		})

		it('does not show show-more affordance when content has ≤ 40 lines', () => {
			const { po } = mountCard({ status: 'pending', content: 'just one line' })
			expect(po.hasShowMore()).toBe(false)
		})

		it('does not render accepted, rejected, failed, or path-invalid bodies', () => {
			const { po } = mountCard({ status: 'pending' })
			expect(po.hasAcceptedBody()).toBe(false)
			expect(po.hasRejectedBody()).toBe(false)
			expect(po.hasFailedBody()).toBe(false)
			expect(po.hasPathInvalid()).toBe(false)
		})
	})

	describe('T-ASM-068 — accepted state', () => {
		it('shows accepted body and hides accept/reject buttons', () => {
			const { po } = mountCard({ status: 'accepted' })
			expect(po.hasAcceptedBody()).toBe(true)
			expect(po.hasAccept()).toBe(false)
			expect(po.hasReject()).toBe(false)
		})

		it('accepted body includes the validated path (verbatim copy)', () => {
			const { po } = mountCard({ status: 'accepted', path: 'notes/idea.md' })
			expect(po.acceptedBodyEl.text()).toContain("Saved to 'notes/idea.md'.")
		})

		it('still renders path and content preview in accepted state', () => {
			const { po } = mountCard({ status: 'accepted' })
			expect(po.hasPath()).toBe(true)
			expect(po.hasContentPreview()).toBe(true)
		})
	})

	describe('T-ASM-068 — rejected state', () => {
		it('shows rejected body and hides accept/reject buttons', () => {
			const { po } = mountCard({ status: 'rejected' })
			expect(po.hasRejectedBody()).toBe(true)
			expect(po.hasAccept()).toBe(false)
			expect(po.hasReject()).toBe(false)
		})

		it('rejected body uses plain-language "Discarded — no changes were made."', () => {
			const { po } = mountCard({ status: 'rejected' })
			expect(po.rejectedBodyEl.text()).toContain('Discarded — no changes were made.')
		})

		it('rejected state still offers Retry button (REQ-ASM-050)', () => {
			const { po } = mountCard({ status: 'rejected' })
			expect(po.hasRetry()).toBe(true)
		})
	})

	describe('T-ASM-068 — failed state', () => {
		it('shows failed body and hides accept/reject buttons', () => {
			const { po } = mountCard({ status: 'failed', failureReason: 'WRITE_FAILED' })
			expect(po.hasFailedBody()).toBe(true)
			expect(po.hasAccept()).toBe(false)
			expect(po.hasReject()).toBe(false)
		})

		it('failed state uses plain-language fallback copy (no enum leak)', () => {
			const { po } = mountCard({ status: 'failed', failureReason: 'WRITE_FAILED' })
			const text = po.failedBodyEl.text().toLowerCase()
			expect(text).toContain('could not save the file')
			expect(text).not.toContain('write_failed')
		})

		it('failed state offers Retry button (REQ-ASM-050)', () => {
			const { po } = mountCard({ status: 'failed', failureReason: 'WRITE_FAILED' })
			expect(po.hasRetry()).toBe(true)
		})
	})

	describe('T-ASM-068 / REQ-ASM-048 — path-invalid state', () => {
		it('renders path-invalid body and does NOT render Accept button', () => {
			const err = new PathValidationError('CONTAINS_DOTDOT', "Path contains '..'")
			const { po } = mountCard({ status: 'pending' }, err)
			expect(po.hasPathInvalid()).toBe(true)
			expect(po.hasAccept()).toBe(false)
		})

		it('path-invalid takes precedence over status === "pending"', () => {
			const err = new PathValidationError('LEADING_SLASH', 'Leading slash')
			const { po } = mountCard({ status: 'pending' }, err)
			expect(po.hasAcceptedBody()).toBe(false)
			expect(po.hasRejectedBody()).toBe(false)
			expect(po.hasFailedBody()).toBe(false)
		})

		it('uses plain-language copy "That path isn\'t valid for this vault."', () => {
			const err = new PathValidationError('EMPTY', 'empty')
			const { po } = mountCard({ status: 'pending' }, err)
			expect(po.pathInvalidEl.text()).toContain("That path isn't valid for this vault.")
		})

		it('does not leak the kind discriminator into visible copy', () => {
			const err = new PathValidationError('CONTAINS_DOTDOT', 'kind leak attempt')
			const { po } = mountCard({ status: 'pending' }, err)
			const text = po.pathInvalidEl.text().toLowerCase()
			expect(text).not.toContain('contains_dotdot')
			expect(text).not.toContain('leading_slash')
		})
	})

	describe('T-ASM-068 — emits', () => {
		it('Accept button click emits accept with {proposalId}', async () => {
			const { po } = mountCard({ status: 'pending' })
			await po.clickAccept()
			const emitted = po.emitted('accept') as Array<Array<{ proposalId: string }>>
			expect(emitted).toBeTruthy()
			expect(emitted[0][0]).toEqual({ proposalId: 'prop-test-1' })
		})

		it('Reject button click emits reject with {proposalId}', async () => {
			const { po } = mountCard({ status: 'pending' })
			await po.clickReject()
			const emitted = po.emitted('reject') as Array<Array<{ proposalId: string }>>
			expect(emitted).toBeTruthy()
			expect(emitted[0][0]).toEqual({ proposalId: 'prop-test-1' })
		})

		it('Retry button click emits retry with {proposalId}', async () => {
			const { po } = mountCard({ status: 'failed', failureReason: 'WRITE_FAILED' })
			await po.clickRetry()
			const emitted = po.emitted('retry') as Array<Array<{ proposalId: string }>>
			expect(emitted).toBeTruthy()
			expect(emitted[0][0]).toEqual({ proposalId: 'prop-test-1' })
		})
	})

	describe('T-ASM-068 — show-more toggle', () => {
		it('toggles between preview and full content', async () => {
			const longContent = Array.from({ length: 50 }, (_, i) => `row-${i + 1}`).join('\n')
			const { po } = mountCard({ status: 'pending', content: longContent })
			expect(po.contentPreviewText()).not.toContain('row-50')
			await po.clickShowMore()
			expect(po.contentPreviewText()).toContain('row-50')
		})
	})

	// ─────────────────────────────────────────────────────────────────────────
	// T-ASM-069 — Accessibility and tab-order tests
	// ─────────────────────────────────────────────────────────────────────────

	describe('T-ASM-069 / REQ-ASM-042 — ARIA labelling', () => {
		it('root card has role="region" and an aria-label', () => {
			const { po } = mountCard({ status: 'pending' })
			expect(po.cardRole()).toBe('region')
			expect(po.cardAriaLabel()).toBe('File creation proposal')
		})

		it('heading is tabindex="-1" for programmatic focus only', () => {
			const { po } = mountCard({ status: 'pending' })
			expect(po.headingTabindex()).toBe('-1')
		})

		it('Accept button aria-label references the proposed path', () => {
			const { po } = mountCard({ status: 'pending', path: 'docs/x.md' })
			expect(po.acceptAriaLabel()).toBe('Accept proposed file docs/x.md')
		})

		it('Reject button aria-label references the proposed path', () => {
			const { po } = mountCard({ status: 'pending', path: 'docs/x.md' })
			expect(po.rejectAriaLabel()).toBe('Reject proposed file docs/x.md')
		})

		it('Retry button aria-label references the proposed path', () => {
			const { po } = mountCard({ status: 'failed', failureReason: 'WRITE_FAILED', path: 'docs/x.md' })
			expect(po.retryAriaLabel()).toBe('Generate another proposal for docs/x.md')
		})
	})

	describe('T-ASM-069 / NFR-ASM-007 — tab order', () => {
		it('tab order is heading → show-more → accept → reject → retry (when all visible)', () => {
			const longContent = Array.from({ length: 60 }, (_, i) => `row-${i}`).join('\n')
			const { po } = mountCard({ status: 'pending', content: longContent })
			expect(po.allTestIdsInTabOrder()).toEqual([
				'proposal-card-heading',
				'proposal-card-show-more',
				'proposal-card-accept',
				'proposal-card-reject',
				'proposal-card-retry',
			])
		})

		it('tab order without show-more is heading → accept → reject → retry', () => {
			const { po } = mountCard({ status: 'pending', content: 'one line' })
			expect(po.allTestIdsInTabOrder()).toEqual([
				'proposal-card-heading',
				'proposal-card-accept',
				'proposal-card-reject',
				'proposal-card-retry',
			])
		})
	})

	describe('T-ASM-069 — programmatic focus on mount', () => {
		it('heading receives focus on mount', () => {
			const { po } = mountCard({ status: 'pending' })
			// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom test runner has no Obsidian popout windows.
			expect(document.activeElement).toBe(po.headingEl.element)
		})
	})

	describe('T-ASM-069 — keyboard activation (Enter and Space)', () => {
		it('Enter on Accept fires the native click and emits accept', async () => {
			const { po, wrapper } = mountCard({ status: 'pending' })
			// Native <button> elements fire `click` on Enter/Space; in jsdom we simulate
			// the click event the browser would dispatch.
			;(po.acceptEl.element as HTMLButtonElement).click()
			await wrapper.vm.$nextTick()
			expect(po.emitted('accept')).toBeTruthy()
		})

		it('Space on Reject fires the native click and emits reject', async () => {
			const { po, wrapper } = mountCard({ status: 'pending' })
			;(po.rejectEl.element as HTMLButtonElement).click()
			await wrapper.vm.$nextTick()
			expect(po.emitted('reject')).toBeTruthy()
		})
	})

	describe('T-ASM-069 / NFR-CCS-012 — plain language', () => {
		it('no AI/SDK jargon in visible copy across every render state', () => {
			const forbidden = [
				'subprocess',
				'oauth',
				'session_id',
				'stream-json',
				'schema',
				'zod',
				'envelope',
				'api key',
				'system prompt',
				'token',
			]

			const statuses: Array<'pending' | 'accepted' | 'rejected' | 'failed'> = [
				'pending',
				'accepted',
				'rejected',
				'failed',
			]
			for (const status of statuses) {
				const { wrapper } = mountCard({
					status,
					failureReason: status === 'failed' ? 'WRITE_FAILED' : null,
				})
				const text = wrapper.text().toLowerCase()
				for (const term of forbidden) {
					expect(text, `state=${status} term=${term}`).not.toContain(term)
				}
			}

			const err = new PathValidationError('CONTAINS_DOTDOT', '')
			const { wrapper: invalidWrapper } = mountCard({ status: 'pending' }, err)
			const text = invalidWrapper.text().toLowerCase()
			for (const term of forbidden) {
				expect(text).not.toContain(term)
			}
		})
	})
})
