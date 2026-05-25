/**
 * T-CP-031 (RED) — `MentionRow.vue` row layouts + verbatim text (TEST-CP-017).
 *
 * SPEC-CP-020, SPEC-CP-037. A file/folder referent → a single-line ellipsised
 * path; a subagent/MCP referent → a two-line name + description with a
 * category-distinct icon via `<SpIcon>` (REQ-CP-011). No `v-html`: a `<script>`
 * in a name renders VERBATIM as text, never executed (EC-CP-13). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-009/011/013, NFR-CP-003/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MentionRow from '@/ui/chat/composer/MentionRow.vue';
import type { MentionReferent } from '@/domain/ports';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { MentionRowPageObject } from './MentionRow.po';

function mountRow(referent: MentionReferent) {
	const wrapper = mount(MentionRow, {
		props: { referent },
		global: { provide: { [ICON_PORT as symbol]: staticIconPort } },
	});
	return { wrapper, po: new MentionRowPageObject(wrapper) };
}

const file: MentionReferent = {
	kind: 'file',
	name: 'notes.md',
	mentionText: '@notes.md',
	detail: 'specs/notes.md',
};

const subagent: MentionReferent = {
	kind: 'subagent',
	name: 'reviewer',
	mentionText: '@reviewer',
	detail: 'Reviews diffs against the spec',
};

describe('MentionRow (TEST-CP-017)', () => {
	it('renders the referent name', () => {
		const { po } = mountRow(file);
		expect(po.exists()).toBe(true);
		expect(po.name()).toBe('notes.md');
	});

	it('a file referent renders a single-line layout (not two-line)', () => {
		const { po } = mountRow(file);
		expect(po.isTwoLine()).toBe(false);
	});

	it('a subagent referent renders the two-line name + description layout', () => {
		const { po } = mountRow(subagent);
		expect(po.isTwoLine()).toBe(true);
		expect(po.hasDetail()).toBe(true);
		expect(po.detail()).toBe('Reviews diffs against the spec');
	});

	it('REQ-CP-011: a category-distinct icon renders via SpIcon', () => {
		const { po } = mountRow(subagent);
		expect(po.hasIcon()).toBe(true);
	});

	it('EC-CP-13: a <script> in the name renders verbatim as text (no v-html sink)', () => {
		const malicious: MentionReferent = {
			kind: 'file',
			name: '<script>alert(1)</script>.md',
			mentionText: '@x.md',
			detail: 'x',
		};
		const { po } = mountRow(malicious);
		expect(po.name()).toBe('<script>alert(1)</script>.md');
		// No live <script> element was injected — the markup is escaped text.
		expect(po.html()).not.toContain('<script>alert(1)</script>');
	});
});
