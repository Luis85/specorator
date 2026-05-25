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
					readOnlyNotice:
						"This provider can't answer inline; respond in your message instead.",
					exitPlanTitle: 'Plan complete',
					implement: 'Implement',
					revise: 'Revise',
					cancel: 'Cancel',
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
				},
				selection: {
					label: 'Captured selection',
					clear: 'Clear selection',
					editor: '{notePath} · line {startLine} (+{lineCount})',
					canvas: '{canvasPath} ({count} nodes)',
				},
			},
		},
	},
} as const;
