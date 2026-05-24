/**
 * T-PSR-005 (TEST-PSR-008) — RED: the empty agent panel placeholder.
 *
 * SPEC-PSR-006. Fails until `src/ui/agent/AgentPanelRoot.vue` exists and the
 * i18n catalogue carries `agent.empty.placeholder` (T-PSR-007). Queried by
 * `data-testid` only (ADR-009). Traces: REQ-PSR-002; SPEC-PSR-006.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AgentPanelRoot from '@/ui/agent/AgentPanelRoot.vue';
import { i18n } from '@/ui/i18n';
import { AgentPanelRootPageObject } from './AgentPanelRoot.po';

describe('AgentPanelRoot (TEST-PSR-008)', () => {
	it('renders agent.empty.placeholder under data-testid="agent-panel-empty"', () => {
		const wrapper = mount(AgentPanelRoot, { global: { plugins: [i18n] } });
		const po = new AgentPanelRootPageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.text()).toBe('The Specorator agent panel is empty. Chat lands in a later phase.');
	});
});
