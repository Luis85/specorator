import type { VueWrapper } from '@vue/test-utils';

export class AgentSidepanelRootSlashCommandsPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('agent-sidepanel'));
	}

	get helpPanel() {
		return this.wrapper.find(this.byTid('agent-help-panel'));
	}

	get helpSearch() {
		return this.wrapper.find(this.byTid('help-search'));
	}

	helpItemByName(name: string) {
		// WS-AUX-8b: HelpPopover items are keyed by `data-testid="help-item"`
		// without a per-name suffix; match by visible text of the shortcut span
		// (e.g. `/clear`) so the assertion intent — "row for command X exists" —
		// is preserved.
		const rows = this.wrapper.findAll(this.byTid('help-item'));
		return (
			rows.find((row) => row.text().includes(`/${name}`)) ?? {
				exists: () => false,
			}
		);
	}

	hasHelpPanel(): boolean {
		return this.helpPanel.exists();
	}

	async pressHelpEscape(): Promise<void> {
		await this.helpSearch.trigger('keydown', { key: 'Escape' });
	}
}
