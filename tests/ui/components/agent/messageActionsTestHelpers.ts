/**
 * Shared mount helper for `MessageActions.vue` tests after the WS-AUX-5
 * refresh (REQ-AUX-001 / REQ-AUX-002). The component now composes
 * `<SpIconButton>` which needs `ICON_PORT` + `LOGGER_PORT` provides.
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '@/ui/i18n';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';
import MessageActions from '@/ui/components/agent/MessageActions.vue';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

export interface MountMessageActionsProps {
	messageId: string;
	role: 'user' | 'assistant';
	isLatest: boolean;
	showFork?: boolean;
}

export function mountMessageActions(props: MountMessageActionsProps): VueWrapper {
	const bridge = new MockBridge() as unknown as IconPort;
	return mount(MessageActions, {
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		props,
		// Make sure the host stamps `.sp-hover-host` so HoverActions doesn't warn.
		attachTo: (() => {
			const host = document.createElement('div');
			host.className = 'sp-hover-host';
			document.body.appendChild(host);
			return host;
		})(),
	});
}
