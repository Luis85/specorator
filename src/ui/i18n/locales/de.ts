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
				inline: {
					askTitle: 'Frage',
					customPlaceholder: 'Eigene Antwort eingeben…',
					readOnlyNotice:
						'Dieser Anbieter kann nicht inline antworten; antworte stattdessen in deiner Nachricht.',
					exitPlanTitle: 'Plan abgeschlossen',
					implement: 'Umsetzen',
					revise: 'Überarbeiten',
					cancel: 'Abbrechen',
					approval: {
						allowOnce: 'Einmal erlauben',
						allowAlways: 'Immer erlauben',
						denyOnce: 'Einmal ablehnen',
						denyAlways: 'Immer ablehnen',
					},
					revisePlaceholder: 'Feedback zur weiteren Planung eingeben…',
				},
				bash: {
					exitLabel: 'Exit',
					placeholder: 'Shell-Befehl ausführen…',
				},
				instruction: {
					placeholder: 'Systemanweisung hinzufügen…',
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
			context: {
				files: {
					label: 'Angehängte Dateien',
					open: '{name} öffnen',
					remove: '{name} entfernen',
				},
				images: {
					label: 'Angehängte Bilder',
					preview: '{name} ansehen',
					remove: '{name} entfernen',
					rejected: '{name} konnte nicht angehängt werden — kein unterstütztes Bild oder zu groß.',
				},
				attach: 'Datei oder Bild anhängen',
				selection: {
					label: 'Erfasste Auswahl',
					clear: 'Auswahl löschen',
					editor: '{notePath} · Zeile {startLine} (+{lineCount})',
					canvas: '{canvasPath} ({count} Knoten)',
					browserCapture: 'Browser-Auswahl erfassen',
				},
			},
			toolbar: {
				model: {
					label: 'Modell',
					open: 'Modell wählen',
					empty: 'Keine Modelle verfügbar',
				},
				mode: {
					label: 'Modus',
				},
				permission: {
					label: 'Berechtigungen',
					mode: {
						normal: 'Normal',
						plan: 'Plan',
						yolo: 'Automatisch erlauben',
					},
					plan: 'PLAN',
					deferred: 'Berechtigungsregeln folgen in einer späteren Version.',
				},
				thinking: {
					label: 'Denken',
					open: 'Denk-Aufwand wählen',
					effortLabel: 'Aufwand',
					budgetLabel: 'Budget',
					effort: {
						high: 'Hoch',
						medium: 'Mittel',
						low: 'Niedrig',
					},
				},
				serviceTier: {
					label: 'Priorität',
				},
				mcp: {
					label: 'MCP-Server',
					empty: 'MCP-Server folgen in einer späteren Version.',
				},
				external: {
					label: 'Externer Kontext',
					deferred: 'Externer Ordner-Kontext folgt in einer späteren Version.',
				},
				usage: {
					label: 'Kontextnutzung {percent}%',
					compactHint: 'Der Kontext füllt sich — führe /compact aus, um Platz zu schaffen.',
				},
			},
				approvals: {
					title: 'Freigaben',
					mode: 'Modus: {mode}',
					rulesHeading: 'Regeln',
					empty: 'Noch keine Freigaberegeln.',
					decision: {
						allow: 'erlauben',
						deny: 'ablehnen',
					},
					lifetime: {
						session: 'Sitzung',
						persisted: 'dauerhaft',
					},
					remove: 'Regel entfernen: {tool} {pattern}',
					storeError: 'Deine Freigaberegeln konnten nicht gelesen werden — frage für diese Aktion nach.',
				},
		},
	},
} as const;
