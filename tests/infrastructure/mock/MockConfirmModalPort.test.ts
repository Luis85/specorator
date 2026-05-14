/**
 * T-ASM-060 — Tests for MockConfirmModalPort field-driven fake.
 *
 * Satisfies REQ-ASM-044 (ADR-0032). Mirrors the structural conventions of
 * `MockClaudeCliPort.test.ts`: every behaviour is configurable through
 * public fields and every invocation is captured in an append-only log.
 *
 * Verifies:
 *   - Safe-by-default rejection (`nextResult === false`).
 *   - `nextResult` toggles resolved value (`true` / `false`).
 *   - `calls` is append-only and preserves request payload verbatim.
 *   - `show()` never throws.
 *   - `delayMs` defers resolution.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import type { ConfirmModalRequest } from '@/domain/ports/ConfirmModalPort'

const baseRequest: ConfirmModalRequest = {
	title: 'Overwrite existing file?',
	body: 'specs/foo/idea.md already exists. Overwrite?',
	confirmLabel: 'Overwrite',
	cancelLabel: 'Cancel',
}

describe('REQ-ASM-044: MockConfirmModalPort', () => {
	let mock: MockConfirmModalPort

	beforeEach(() => {
		mock = new MockConfirmModalPort()
	})

	// ── Defaults ───────────────────────────────────────────────────────────

	it('nextResult defaults to false (safe-by-default rejection)', () => {
		expect(mock.nextResult).toBe(false)
	})

	it('delayMs defaults to 0', () => {
		expect(mock.delayMs).toBe(0)
	})

	it('calls is initially empty', () => {
		expect(mock.calls).toHaveLength(0)
	})

	it('show() resolves false by default', async () => {
		await expect(mock.show(baseRequest)).resolves.toBe(false)
	})

	// ── nextResult toggle ─────────────────────────────────────────────────

	it('show() resolves true when nextResult is true', async () => {
		mock.nextResult = true
		await expect(mock.show(baseRequest)).resolves.toBe(true)
	})

	it('show() resolves false when nextResult is false', async () => {
		mock.nextResult = false
		await expect(mock.show(baseRequest)).resolves.toBe(false)
	})

	// ── calls log ─────────────────────────────────────────────────────────

	it('show() appends the request payload to calls verbatim', async () => {
		await mock.show(baseRequest)
		expect(mock.calls).toHaveLength(1)
		expect(mock.calls[0]).toEqual(baseRequest)
	})

	it('calls captures title, body, confirmLabel, and cancelLabel', async () => {
		await mock.show(baseRequest)
		const captured = mock.calls[0]
		expect(captured.title).toBe(baseRequest.title)
		expect(captured.body).toBe(baseRequest.body)
		expect(captured.confirmLabel).toBe(baseRequest.confirmLabel)
		expect(captured.cancelLabel).toBe(baseRequest.cancelLabel)
	})

	it('calls is append-only across multiple show() invocations', async () => {
		const second: ConfirmModalRequest = {
			title: 'Second',
			body: 'second body',
			confirmLabel: 'OK',
			cancelLabel: 'No',
		}
		await mock.show(baseRequest)
		await mock.show(second)
		expect(mock.calls).toHaveLength(2)
		expect(mock.calls[0]).toEqual(baseRequest)
		expect(mock.calls[1]).toEqual(second)
	})

	it('calls captures the request even when nextResult is false', async () => {
		mock.nextResult = false
		await mock.show(baseRequest)
		expect(mock.calls).toHaveLength(1)
	})

	it('calls captures the request even when nextResult is true', async () => {
		mock.nextResult = true
		await mock.show(baseRequest)
		expect(mock.calls).toHaveLength(1)
	})

	// ── Never throws ──────────────────────────────────────────────────────

	it('show() never throws synchronously', () => {
		expect(() => mock.show(baseRequest)).not.toThrow()
	})

	it('show() never rejects (returns a resolved Promise)', async () => {
		// Run twice to catch a state-mutation regression.
		await expect(mock.show(baseRequest)).resolves.toBeTypeOf('boolean')
		mock.nextResult = true
		await expect(mock.show(baseRequest)).resolves.toBeTypeOf('boolean')
	})

	// ── delayMs ──────────────────────────────────────────────────────────

	describe('delayMs', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('show() defers resolution by delayMs when > 0', async () => {
			mock.delayMs = 100
			mock.nextResult = true
			const settled = vi.fn()
			const promise = mock.show(baseRequest).then(settled)

			// Should not resolve before timers advance.
			await Promise.resolve()
			expect(settled).not.toHaveBeenCalled()

			await vi.advanceTimersByTimeAsync(100)
			await promise
			expect(settled).toHaveBeenCalledWith(true)
		})

		it('show() records the call before awaiting the delay', async () => {
			mock.delayMs = 50
			const promise = mock.show(baseRequest)
			// Captured synchronously before the delay fires.
			expect(mock.calls).toHaveLength(1)
			await vi.advanceTimersByTimeAsync(50)
			await promise
		})
	})
})
