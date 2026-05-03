/**
 * Surfaces a transient user-visible notice. Default duration is 4000ms
 * when not specified by the caller; implementations honour that default.
 */
export interface NotificationPort {
	showNotice(message: string, durationMs?: number): void
}
