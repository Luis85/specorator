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
				dropdown: {
					hints: 'Enter zum Auswählen · Pfeiltasten zum Navigieren · Esc zum Abbrechen',
				},
				mention: {
					empty: 'Keine Treffer',
				},
			},
			busy: 'Antwort wird generiert…',
			interrupted: 'Unterbrochen',
			tabs: {
				label: 'Chat-Tabs',
				new: 'Neuer Tab',
				close: 'Tab schließen',
				ceiling: 'Maximale Anzahl an Tabs erreicht.',
			},
			compact: 'Konversation verdichten',
			fork: 'Ab hier verzweigen',
			rewind: 'Hierher zurückspulen',
			rewindConversation: 'Nur Konversation',
			rewindCode: 'Code und Konversation',
			codeRewindGated: 'Code-Rollback ist in dieser Phase nicht verfügbar.',
			history: {
				open: 'Frühere Konversationen',
				empty: 'Noch keine früheren Konversationen.',
				rename: 'Umbenennen',
				delete: 'Löschen',
				deleteConfirm: 'Diese Konversation löschen? Dies kann nicht rückgängig gemacht werden.',
			},
			forkTarget: {
				title: 'Konversation verzweigen',
				newTab: 'Neuer Tab',
				currentTab: 'Aktueller Tab',
			},
		},
	},
} as const;
