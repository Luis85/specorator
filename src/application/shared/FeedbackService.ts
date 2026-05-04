import type { LoggerPort, NotificationPort } from '@/domain/ports'
import type { Result } from '@/domain/shared/Result'
import { toUserMessage } from './errorMessages'

export class FeedbackService {
	constructor(
		private readonly log: LoggerPort,
		private readonly notify: NotificationPort,
	) {}

	reportResult<T>(
		result: Result<T>,
		context: {
			operation: string
			successMessage?: string
			errorLabel: string
			logContext?: Record<string, unknown>
		},
	): Result<T> {
		if (result.ok) {
			this.log.info(context.operation, { ...context.logContext, success: true })
			if (context.successMessage) this.notify.showSuccess(context.successMessage)
		} else {
			this.log.error(context.operation, result.error, context.logContext)
			this.notify.showError(`${context.errorLabel}: ${toUserMessage(result.error)}`)
		}
		return result
	}

	warn(message: string, context?: Record<string, unknown>): void {
		this.log.warn(message, context)
		this.notify.showWarning(message)
	}

	debug(message: string, context?: Record<string, unknown>): void {
		this.log.debug(message, context)
	}
}
