/**
 * T-CC-023 (RED) — `WelcomeGreeting.vue` (TEST-CC-012, EC-16).
 *
 * SPEC-CC-020. A centered serif greeting driven by the `agent.chat.welcome.greeting`
 * i18n key (brand-neutral; no duration footer — CLAR-CC-004). Visibility is the
 * parent's concern (shown when the thread is empty); this test asserts the rendered
 * key + the testid. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CC-011.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import WelcomeGreeting from '@/ui/chat/WelcomeGreeting.vue';
import { i18n, setLocale } from '@/ui/i18n';
import { WelcomeGreetingPageObject } from './WelcomeGreeting.po';

function mountWelcome() {
	const wrapper = mount(WelcomeGreeting, { global: { plugins: [i18n] } });
	return { wrapper, po: new WelcomeGreetingPageObject(wrapper) };
}

describe('WelcomeGreeting (TEST-CC-012)', () => {
	it('renders the brand-neutral greeting from the i18n key', () => {
		setLocale('en');
		const { po } = mountWelcome();
		expect(po.exists()).toBe(true);
		expect(po.text()).toBe('How can I help?');
	});

	it('does not render a duration footer (CLAR-CC-004)', () => {
		const { po } = mountWelcome();
		expect(po.text().toLowerCase()).not.toContain('baked');
	});

	it('EC-16: resolves the localized greeting (de)', () => {
		setLocale('de');
		const { po } = mountWelcome();
		expect(po.text()).toBe('Wie kann ich helfen?');
		setLocale('en');
	});
});
