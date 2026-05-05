import { describe, expect, it } from 'vitest'
import { toUserMessage } from '@/application/shared/errorMessages'

describe('toUserMessage', () => {
	it('maps a known domain error to a friendly message', () => {
		expect(toUserMessage(new Error('Title cannot be empty'))).toBe('Please enter a feature title.')
	})

	it('returns the raw message for unknown errors', () => {
		expect(toUserMessage(new Error('Some unknown domain error'))).toBe(
			'Some unknown domain error',
		)
	})
})
