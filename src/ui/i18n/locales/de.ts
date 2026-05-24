export default {
	agent: {
		empty: {
			placeholder: 'Das Specorator-Agent-Panel ist leer. Der Chat folgt in einer späteren Phase.',
		},
		chat: {
			welcome: {
				greeting: 'Wie kann ich helfen?',
			},
			composer: {
				placeholder: 'Nachricht senden…',
				send: 'Nachricht senden',
				stop: 'Generierung stoppen',
			},
			busy: 'Antwort wird generiert…',
			interrupted: 'Unterbrochen',
		},
	},
} as const;
