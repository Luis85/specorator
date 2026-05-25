/**
 * T-CP-041 (RED) — `BangBashOutput.vue` (TEST-CP-013 A leg).
 *
 * SPEC-CP-025. Renders a `BangBashOutput` DTO as a tool-like output block:
 * monospace stdout + stderr, a non-zero exit indication (the exit-code badge),
 * and the `notice` (timeout/truncated) when present (REQ-CP-031). No `v-html` — a
 * `<script>` in the output renders verbatim as text, never executed (EC-CP-13).
 * Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-031, NFR-CP-003.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BangBashOutput from '@/ui/chat/composer/BangBashOutput.vue';
import { i18n } from '@/ui/i18n';
import type { BangBashOutput as BangBashOutputDto } from '@/application/chat/composer/SubmitBangBashUseCase';
import { BangBashOutputPageObject } from './BangBashOutput.po';

function mountOutput(output: BangBashOutputDto) {
	const wrapper = mount(BangBashOutput, { props: { output }, global: { plugins: [i18n] } });
	return { wrapper, po: new BangBashOutputPageObject(wrapper) };
}

const OK: BangBashOutputDto = {
	command: 'echo hi',
	stdout: 'hi\n',
	stderr: '',
	exitCode: 0,
	truncated: false,
};

describe('BangBashOutput render (TEST-CP-013)', () => {
	it('renders the command + stdout', () => {
		const { po } = mountOutput(OK);
		expect(po.exists()).toBe(true);
		expect(po.commandText()).toContain('echo hi');
		expect(po.stdoutText()).toContain('hi');
	});

	it('shows stderr when present', () => {
		const { po } = mountOutput({ ...OK, stderr: 'oops' });
		expect(po.hasStderr()).toBe(true);
		expect(po.stderrText()).toContain('oops');
	});

	it('shows a non-zero exit badge (REQ-CP-031)', () => {
		const { po } = mountOutput({ ...OK, exitCode: 2, stderr: 'boom' });
		expect(po.hasExitBadge()).toBe(true);
		expect(po.exitText()).toContain('2');
	});

	it('shows the truncation/timeout notice when present', () => {
		const { po } = mountOutput({
			...OK,
			exitCode: 124,
			truncated: true,
			notice: 'Command timed out after 30s.',
		});
		expect(po.hasNotice()).toBe(true);
		expect(po.noticeText()).toContain('timed out');
	});
});

describe('BangBashOutput XSS-safety (EC-CP-13)', () => {
	it('renders a <script> in the output verbatim as text, never as markup', () => {
		const { po } = mountOutput({ ...OK, stdout: '<script>alert(1)</script>' });
		// The text content shows the literal markup…
		expect(po.stdoutText()).toContain('<script>alert(1)</script>');
		// …and the DOM holds no live <script> element (escaped, not parsed).
		expect(po.stdoutHtml()).not.toContain('<script>');
		expect(po.stdoutHtml()).toContain('&lt;script&gt;');
	});
});
