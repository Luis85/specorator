/**
 * T-MHP-142 — ProposalNoticeEmitter tests.
 *
 * NOTE on task-ID vs path mapping: the user's task brief for T-MHP-142 names
 * the ProposalNoticeEmitter tests at this path. The tasks.md entry for
 * T-MHP-142 itself is the `intent` echo + default empty test; the notice
 * emitter tests are tracked there as T-MHP-100. Per the user's explicit
 * routing, this file covers the NoticeEmitter contract per SPEC-MHP-042 +
 * REQ-MHP-046. Flagged in the qa hand-off note.
 *
 * Satisfies: REQ-MHP-046; TEST-MHP-049; EC-MHP-034; SPEC-MHP-042.
 *
 * Contract under test:
 *   - On `proposalEnqueued` with status: 'pending', NotificationPort.showInfo
 *     is invoked exactly once with copy
 *       `Pending MCP proposal from <client.id>. Review in your MCP client.`
 *     (verbatim from Part B §S15).
 *   - On `proposalEnqueued` with status: 'accepted' (auto-accept path),
 *     NotificationPort.showInfo is NOT called (silent per Part A §F2).
 *   - Per-proposal-id idempotence — duplicate enqueued emissions for the
 *     same proposalId fire showInfo only once.
 *   - The emitter does NOT call showError, showWarning, or showSuccess for
 *     pending proposals.
 *
 * This test MUST fail before T-MHP-101 ships
 * `src/application/mcp/ProposalNoticeEmitter.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createEventBus } from '@/domain/shared/event-bus'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

import { ProposalNoticeEmitter } from '@/application/mcp/ProposalNoticeEmitter'

interface ProposalEnqueuedPayload {
	proposalId: string
	tool: string
	status: 'pending' | 'accepted'
	client: { id: string; transport: 'in-process' | 'loopback'; address: string }
}

function enqueue(
	bus: ReturnType<typeof createEventBus>,
	proposalId: string,
	status: 'pending' | 'accepted',
	clientId = 'cursor',
): void {
	const payload: ProposalEnqueuedPayload = {
		proposalId,
		tool: 'vault_write_note',
		status,
		client: { id: clientId, transport: 'loopback', address: '127.0.0.1:55555' },
	}
	bus.emit('proposalEnqueued' as never, payload as never)
}

describe('T-MHP-142 — ProposalNoticeEmitter (SPEC-MHP-042, REQ-MHP-046)', () => {
	let ports: ReturnType<typeof fakeModulePorts>
	let bus: ReturnType<typeof createEventBus>

	beforeEach(() => {
		ports = fakeModulePorts()
		bus = createEventBus()
	})

	it('fires NotificationPort.showInfo once on proposalEnqueued (status: pending)', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'cursor')
		expect(ports.bridge.notices.filter((n) => n.severity === 'info')).toHaveLength(1)
	})

	it('uses the verbatim Part B §S15 copy with client.id interpolated', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'cursor')
		const infoNotices = ports.bridge.notices.filter((n) => n.severity === 'info')
		expect(infoNotices).toHaveLength(1)
		expect(infoNotices[0]?.message).toBe(
			'Pending MCP proposal from cursor. Review in your MCP client.',
		)
	})

	it('falls back to client.id "unknown" when caller had no clientInfo.name (REQ-MHP-035)', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'unknown')
		const infoNotices = ports.bridge.notices.filter((n) => n.severity === 'info')
		expect(infoNotices[0]?.message).toBe(
			'Pending MCP proposal from unknown. Review in your MCP client.',
		)
	})

	it('does NOT fire showInfo on auto-accept (status: accepted) — silent per Part A §F2', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'accepted', 'cursor')
		expect(ports.bridge.notices.filter((n) => n.severity === 'info')).toHaveLength(0)
	})

	it('is idempotent per proposalId — duplicate emissions emit one notice', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'cursor')
		enqueue(bus, 'p1', 'pending', 'cursor')
		enqueue(bus, 'p1', 'pending', 'cursor')
		expect(ports.bridge.notices.filter((n) => n.severity === 'info')).toHaveLength(1)
	})

	it('treats two distinct proposalIds as two notices', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'cursor')
		enqueue(bus, 'p2', 'pending', 'claude-desktop')
		expect(ports.bridge.notices.filter((n) => n.severity === 'info')).toHaveLength(2)
	})

	it('does NOT emit showError, showWarning, or showSuccess for pending proposals', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'cursor')
		const offBrand = ports.bridge.notices.filter((n) => n.severity !== 'info')
		expect(offBrand).toHaveLength(0)
	})

	it('stops emitting after dispose()', () => {
		const emitter = new ProposalNoticeEmitter({ bus, notify: ports.notifications })
		emitter.start()
		enqueue(bus, 'p1', 'pending', 'cursor')
		expect(ports.bridge.notices.filter((n) => n.severity === 'info')).toHaveLength(1)
		emitter.dispose()
		enqueue(bus, 'p2', 'pending', 'cursor')
		// Still 1 — the disposed emitter must not fire for p2.
		expect(ports.bridge.notices.filter((n) => n.severity === 'info')).toHaveLength(1)
	})
})
