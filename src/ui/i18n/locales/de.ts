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
				storeError:
					'Deine Freigaberegeln konnten nicht gelesen werden — frage für diese Aktion nach.',
			},
			mcp: {
				settings: {
					title: 'MCP-Server',
					empty: 'Noch keine MCP-Server.',
					add: 'MCP-Server hinzufügen',
					paste: 'Konfiguration einfügen',
				},
				row: {
					enabled: '{name} aktivieren',
					edit: '{name} bearbeiten',
					remove: '{name} entfernen',
					test: '{name} testen',
					type: {
						stdio: 'stdio',
						sse: 'SSE',
						http: 'HTTP',
					},
				},
				modal: {
					addTitle: 'MCP-Server hinzufügen',
					editTitle: 'MCP-Server bearbeiten',
					nameLabel: 'Name',
					configLabel: 'Konfiguration',
					configPlaceholder: 'Server-Konfiguration als JSON einfügen…',
					descriptionLabel: 'Beschreibung',
					contextSavingLabel: 'Kontextsparend (nur bei Erwähnung laden)',
					nameRequired: 'Ein Servername ist erforderlich.',
					nameDuplicate: 'Ein Server namens "{name}" existiert bereits.',
					parseError: 'Diese Konfiguration konnte nicht gelesen werden: {reason}',
					save: 'Speichern',
					cancel: 'Abbrechen',
				},
				test: {
					title: 'MCP-Server testen',
					running: 'Verbinde…',
					successTitle: 'Verbunden',
					server: '{name} {version}',
					toolsHeading: 'Werkzeuge',
					toolToggle: 'Werkzeug {tool} aktivieren',
					partial: 'Verbunden, aber keine Werkzeuge aufgelistet.',
					timeout: 'Verbindungs-Timeout (10s)',
					unavailable: 'MCP-Tests erfordern die Desktop-App.',
					close: 'Schließen',
				},
				selector: {
					badge: '{count} aktiv',
				},
				notice: {
					serverFailed: 'Ein MCP-Server war nicht erreichbar.',
					saveFailed: 'Deine MCP-Server-Konfiguration konnte nicht gespeichert werden.',
				},
			},
			providers: {
				chooser: {
					title: 'Anbieter',
					select: '{provider} auswählen',
					active: 'Aktiv',
					default: 'Standard',
				},
				name: {
					claude: 'Claude',
					codex: 'Codex',
					opencode: 'Opencode',
				},
				secret: {
					label: 'API-Schlüssel',
					placeholder: 'Gib deinen API-Schlüssel ein',
					save: 'API-Schlüssel speichern',
					unavailable: 'Der sichere Speicher ist auf diesem Gerät nicht verfügbar.',
				},
				notice: {
					keyRequired: 'Für {provider} ist ein API-Schlüssel erforderlich.',
					cliNotFound: 'Die {provider}-CLI wurde nicht gefunden.',
					unavailable: '{provider} ist derzeit nicht verfügbar.',
					unsupported: '{feature} wird von {provider} nicht unterstützt.',
				},
				consent: {
					title: '{provider}-Verlauf lesen erlauben?',
					body: '{provider} speichert seinen Gesprächsverlauf außerhalb deines Tresors ({root}). Specorator erlauben, ihn zu lesen?',
					allow: 'Erlauben',
					decline: 'Nicht jetzt',
					declined: '{provider}-Verlauf bleibt deaktiviert.',
				},
			},
		},
	},
} as const;
