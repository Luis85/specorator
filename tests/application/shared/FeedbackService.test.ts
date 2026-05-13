import { describe, expect, it, vi } from 'vitest'
import { FeedbackService } from '@/application/shared/FeedbackService'
import type { LoggerPort, NotificationPort } from '@/domain/ports'
import type { Result } from '@/domain/shared/Result'

function makeFakeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function makeFakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	}
}

function ok<T>(value: T): Result<T> {
	return { ok: true, value }
}
function err(message: string): { ok: false; error: Error } {
	return { ok: false, error: new Error(message) }
}

describe('FeedbackService.reportResult', () => {
	it('on ok result with successMessage: calls log.info and notify.showSuccess', () => {
		const log = makeFakeLogger()
		const notify = makeFakeNotify()
		const svc = new FeedbackService(log, notify)

		svc.reportResult(ok('value'), {
			operation: 'create',
			errorLabel: 'Create failed',
			successMessage: 'Created!',
		})

		expect(log.info).toHaveBeenCalledWith('create', { success: true })
		expect(notify.showSuccess).toHaveBeenCalledWith('Created!')
		expect(notify.showError).not.toHaveBeenCalled()
	})

	it('on ok result without successMessage: calls log.info but no notification', () => {
		const log = makeFakeLogger()
		const notify = makeFakeNotify()
		const svc = new FeedbackService(log, notify)

		svc.reportResult(ok('value'), { operation: 'load', errorLabel: 'Load failed' })

		expect(log.info).toHaveBeenCalledWith('load', { success: true })
		expect(notify.showSuccess).not.toHaveBeenCalled()
		expect(notify.showError).not.toHaveBeenCalled()
	})

	it('on err result: calls log.error and notify.showError with errorLabel + raw message by default', () => {
		const log = makeFakeLogger()
		const notify = makeFakeNotify()
		const svc = new FeedbackService(log, notify)
		const result = err('Title cannot be empty')

		svc.reportResult(result, { operation: 'create', errorLabel: 'Create failed' })

		expect(log.error).toHaveBeenCalledWith('create', result.error, undefined)
		expect(notify.showError).toHaveBeenCalledWith('Create failed: Title cannot be empty')
	})

	it('on err result: uses translateError function when provided', () => {
		const log = makeFakeLogger()
		const notify = makeFakeNotify()
		const translate = (msg: string) =>
			msg === 'Title cannot be empty' ? 'Please enter a feature title.' : msg
		const svc = new FeedbackService(log, notify, translate)
		const result = err('Title cannot be empty')

		svc.reportResult(result, { operation: 'create', errorLabel: 'Create failed' })

		expect(log.error).toHaveBeenCalledWith('create', result.error, undefined)
		expect(notify.showError).toHaveBeenCalledWith('Create failed: Please enter a feature title.')
	})

	it('returns the original Result unchanged on ok', () => {
		const svc = new FeedbackService(makeFakeLogger(), makeFakeNotify())
		const result = ok(42)
		expect(svc.reportResult(result, { operation: 'x', errorLabel: 'y' })).toBe(result)
	})

	it('returns the original Result unchanged on err', () => {
		const svc = new FeedbackService(makeFakeLogger(), makeFakeNotify())
		const result = err('boom')
		expect(svc.reportResult(result, { operation: 'x', errorLabel: 'y' })).toBe(result)
	})
})

describe('FeedbackService.warn', () => {
	it('calls log.warn and notify.showWarning', () => {
		const log = makeFakeLogger()
		const notify = makeFakeNotify()
		new FeedbackService(log, notify).warn('heads up', { ctx: 1 })
		expect(log.warn).toHaveBeenCalledWith('heads up', { ctx: 1 })
		expect(notify.showWarning).toHaveBeenCalledWith('heads up')
	})
})

describe('FeedbackService.debug', () => {
	it('calls log.debug and NO notification', () => {
		const log = makeFakeLogger()
		const notify = makeFakeNotify()
		new FeedbackService(log, notify).debug('internal', { key: 'val' })
		expect(log.debug).toHaveBeenCalledWith('internal', { key: 'val' })
		expect(notify.showError).not.toHaveBeenCalled()
		expect(notify.showWarning).not.toHaveBeenCalled()
		expect(notify.showSuccess).not.toHaveBeenCalled()
		expect(notify.showInfo).not.toHaveBeenCalled()
	})
})
