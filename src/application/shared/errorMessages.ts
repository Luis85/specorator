const KNOWN_MESSAGES: Record<string, string> = {
	'Title cannot be empty': 'Please enter a feature title.',
}

export function toUserMessage(err: Error): string {
	return KNOWN_MESSAGES[err.message] ?? err.message
}
