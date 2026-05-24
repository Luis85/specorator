export default {
	agent: {
		empty: {
			placeholder: 'The Specorator agent panel is empty. Chat lands in a later phase.',
		},
		chat: {
			welcome: {
				greeting: 'How can I help?',
			},
			composer: {
				placeholder: 'Send a message…',
				send: 'Send message',
				stop: 'Stop generating',
			},
			busy: 'Generating a response…',
			interrupted: 'Interrupted',
		},
	},
} as const;
