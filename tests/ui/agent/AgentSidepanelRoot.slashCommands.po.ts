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

	get helpClose() {
		return this.wrapper.find(this.byTid('agent-help-close'));
	}

	helpItemByName(name: string) {
		return this.wrapper.find(this.byTid(`agent-help-item-${name}`));
	}

	hasHelpPanel(): boolean {
		return this.helpPanel.exists();
	}

	async clickHelpClose(): Promise<void> {
		await this.helpClose.trigger('click');
	}
}
