/**
 * Tests for `A11yAnnouncer.vue` — off-screen polite ARIA live region for the
 * agent sidepanel (WP-7, a11y P1 wave). Verifies the static ARIA contract
 * (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) and that the
 * message prop is rendered as the announcement text.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import A11yAnnouncer from '@/ui/components/agent/A11yAnnouncer.vue';
import { A11yAnnouncerPO } from './A11yAnnouncer.po';

function mountAnnouncer(message = '') {
	const wrapper = mount(A11yAnnouncer, { props: { message } });
	return { wrapper, po: new A11yAnnouncerPO(wrapper) };
}

describe('A11yAnnouncer', () => {
	it('renders the polite live region with role="status"', () => {
		const { po } = mountAnnouncer();
		expect(po.exists()).toBe(true);
		expect(po.role()).toBe('status');
		expect(po.ariaLive()).toBe('polite');
		expect(po.ariaAtomic()).toBe('true');
	});

	it('renders an empty live region when no message is set', () => {
		const { po } = mountAnnouncer();
		expect(po.text()).toBe('');
	});

	it('renders the message text inside the live region', async () => {
		const { wrapper, po } = mountAnnouncer('Assistant replied.');
		expect(po.text()).toBe('Assistant replied.');
		await wrapper.setProps({ message: 'Generating. Press Escape to stop.' });
		expect(po.text()).toBe('Generating. Press Escape to stop.');
	});
});
