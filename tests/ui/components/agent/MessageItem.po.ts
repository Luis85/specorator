import type { VueWrapper } from '@vue/test-utils';

const TID = {
	rootAssistant: 'agent-message-assistant',
	rootUser: 'agent-message-user',
	roleIcon: 'agent-message-role-icon',
	roleLabel: 'agent-message-role-label',
	timestamp: 'agent-message-timestamp',
	body: 'agent-message-body',
	empty: 'agent-message-empty',
	trim: 'agent-message-trim-note',
} as const;

/**
 * PageObject for `<MessageItem>` (REQ-AUX-014, spec §1.4).
 * Queries by `data-testid` only.
 */
export class MessageItemPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	rootExistsAssistant(): boolean {
		return this.wrapper.find(this.byTid(TID.rootAssistant)).exists();
	}

	rootExistsUser(): boolean {
		return this.wrapper.find(this.byTid(TID.rootUser)).exists();
	}

	roleIconName(): string | null {
		const el = this.wrapper.find(this.byTid(TID.roleIcon)).element as HTMLElement;
		return el.getAttribute('data-icon');
	}

	roleLabelText(): string {
		return this.wrapper.get(this.byTid(TID.roleLabel)).text();
	}

	timestampExists(): boolean {
		return this.wrapper.find(this.byTid(TID.timestamp)).exists();
	}

	timestampText(): string {
		return this.wrapper.get(this.byTid(TID.timestamp)).text();
	}

	timestampDatetime(): string | null {
		const el = this.wrapper.get(this.byTid(TID.timestamp)).element as HTMLElement;
		return el.getAttribute('datetime');
	}

	bodyExists(): boolean {
		return this.wrapper.find(this.byTid(TID.body)).exists();
	}

	emptyExists(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	trimExists(): boolean {
		return this.wrapper.find(this.byTid(TID.trim)).exists();
	}
}
