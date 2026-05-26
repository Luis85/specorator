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
				dropdown: {
					hints: 'Enter to select · Arrow keys to navigate · Esc to cancel',
				},
				mention: {
					empty: 'No matches',
				},
				inline: {
					askTitle: 'Question',
					customPlaceholder: 'Type a custom answer…',
					readOnlyNotice: "This provider can't answer inline; respond in your message instead.",
					exitPlanTitle: 'Plan complete',
					implement: 'Implement',
					revise: 'Revise',
					cancel: 'Cancel',
					approval: {
						allowOnce: 'Allow once',
						allowAlways: 'Always allow',
						denyOnce: 'Deny once',
						denyAlways: 'Always deny',
					},
					revisePlaceholder: 'Enter feedback to continue planning…',
				},
				bash: {
					exitLabel: 'exit',
					placeholder: 'Run a shell command…',
				},
				instruction: {
					placeholder: 'Add a system instruction…',
				},
			},
			busy: 'Generating a response…',
			interrupted: 'Interrupted',
			tabs: {
				label: 'Chat tabs',
				new: 'New tab',
				close: 'Close tab',
				ceiling: 'Maximum number of tabs reached.',
			},
			compact: 'Compact conversation',
			fork: 'Fork from here',
			rewind: 'Rewind to here',
			rewindConversation: 'Conversation only',
			rewindCode: 'Code and conversation',
			codeRewindGated: 'Code rollback is not available in this phase.',
			history: {
				open: 'Past conversations',
				empty: 'No past conversations yet.',
				rename: 'Rename',
				delete: 'Delete',
				deleteConfirm: 'Delete this conversation? This cannot be undone.',
			},
			forkTarget: {
				title: 'Fork conversation',
				newTab: 'New tab',
				currentTab: 'Current tab',
			},
			context: {
				files: {
					label: 'Attached files',
					open: 'Open {name}',
					remove: 'Remove {name}',
				},
				images: {
					label: 'Attached images',
					preview: 'Preview {name}',
					remove: 'Remove {name}',
					rejected:
						'Could not attach {name} — not a supported image, or it exceeds the size limit.',
				},
				attach: 'Attach a file or image',
				selection: {
					label: 'Captured selection',
					clear: 'Clear selection',
					editor: '{notePath} · line {startLine} (+{lineCount})',
					canvas: '{canvasPath} ({count} nodes)',
					browserCapture: 'Capture browser selection',
				},
			},
			toolbar: {
				model: {
					label: 'Model',
					open: 'Choose model',
					empty: 'No models available',
				},
				mode: {
					label: 'Mode',
				},
				permission: {
					label: 'Permissions',
					mode: {
						normal: 'Normal',
						plan: 'Plan',
						yolo: 'Auto-allow',
					},
					plan: 'PLAN',
					deferred: 'Permission rules arrive in a later release.',
				},
				thinking: {
					label: 'Thinking',
					open: 'Choose thinking effort',
					effortLabel: 'Effort',
					budgetLabel: 'Budget',
					effort: {
						high: 'High',
						medium: 'Medium',
						low: 'Low',
					},
				},
				serviceTier: {
					label: 'Priority',
				},
				mcp: {
					label: 'MCP servers',
					empty: 'MCP servers arrive in a later release.',
				},
				external: {
					label: 'External context',
					deferred: 'External folder context arrives in a later release.',
				},
				usage: {
					label: 'Context usage {percent}%',
					compactHint: 'Context is filling up — run /compact to free space.',
				},
			},
			approvals: {
				title: 'Approvals',
				mode: 'Mode: {mode}',
				rulesHeading: 'Rules',
				empty: 'No approval rules yet.',
				decision: {
					allow: 'allow',
					deny: 'deny',
				},
				lifetime: {
					session: 'session',
					persisted: 'persisted',
				},
				remove: 'Remove rule: {tool} {pattern}',
				storeError: 'Could not read your approval rules — asking for this action.',
			},
			mcp: {
				settings: {
					title: 'MCP servers',
					empty: 'No MCP servers yet.',
					add: 'Add MCP server',
					paste: 'Paste configuration',
				},
				row: {
					enabled: 'Enable {name}',
					edit: 'Edit {name}',
					remove: 'Remove {name}',
					test: 'Test {name}',
					type: {
						stdio: 'stdio',
						sse: 'SSE',
						http: 'HTTP',
					},
				},
				modal: {
					addTitle: 'Add MCP server',
					editTitle: 'Edit MCP server',
					nameLabel: 'Name',
					configLabel: 'Configuration',
					configPlaceholder: 'Paste a server configuration as JSON…',
					descriptionLabel: 'Description',
					contextSavingLabel: 'Context-saving (load only when mentioned)',
					nameRequired: 'A server name is required.',
					nameDuplicate: 'A server named "{name}" already exists.',
					parseError: 'Could not read that configuration: {reason}',
					save: 'Save',
					cancel: 'Cancel',
				},
				test: {
					title: 'Test MCP server',
					running: 'Connecting…',
					successTitle: 'Connected',
					server: '{name} {version}',
					toolsHeading: 'Tools',
					toolToggle: 'Enable tool {tool}',
					partial: 'Connected, but no tools were listed.',
					timeout: 'Connection timeout (10s)',
					unavailable: 'MCP testing requires the desktop app.',
					close: 'Close',
				},
				selector: {
					badge: '{count} enabled',
				},
				notice: {
					serverFailed: 'An MCP server could not be reached.',
					saveFailed: 'Could not save your MCP server configuration.',
				},
			},
		},
	},
} as const;
