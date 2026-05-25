import { describe, it, expect } from 'vitest';
import { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import { MockMentionDataProvider } from '@/infrastructure/mock/MockComposerPorts';
import type { MentionDataProviderPort, MentionReferent } from '@/domain/ports';

/**
 * TEST-CP-009 — ResolveMentionUseCase (SPEC-CP-014, REQ-CP-009/010/012/013).
 * query(filter, signal?) → Result<MentionReferent[]> wrapping the port:
 * load-or-default ok([]) on an empty source (EC-CP-3b — the empty MCP source does
 * not error); err only on an irrecoverable read fault; the resolved mentionText
 * is the insertion (REQ-CP-013).
 */
describe('TEST-CP-009 ResolveMentionUseCase', () => {
	it('lists vault file + folder + subagent referents (empty filter)', async () => {
		const useCase = new ResolveMentionUseCase(new MockMentionDataProvider());
		const result = await useCase.query('');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const kinds = result.value.map((r) => r.kind);
		expect(kinds).toContain('file');
		expect(kinds).toContain('folder');
		expect(kinds).toContain('subagent');
	});

	it('does not error when the source returns no MCP referents (EC-CP-3b)', async () => {
		const useCase = new ResolveMentionUseCase(new MockMentionDataProvider());
		const result = await useCase.query('');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.some((r) => r.kind === 'mcp-server')).toBe(false);
	});

	it('resolves ok([]) for an empty source (load-or-default, REQ-CP-012)', async () => {
		const empty = new MockMentionDataProvider([]);
		const result = await new ResolveMentionUseCase(empty).query('anything');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual([]);
	});

	it('surfaces the referent mentionText as the insertion (REQ-CP-013)', async () => {
		const useCase = new ResolveMentionUseCase(new MockMentionDataProvider());
		const result = await useCase.query('notes');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const notes = result.value.find((r) => r.name === 'notes.md');
		expect(notes?.mentionText).toBe('@notes.md');
	});

	it('returns err only on an irrecoverable read fault', async () => {
		const faulty: MentionDataProviderPort = {
			query(): Promise<MentionReferent[]> {
				return Promise.reject(new Error('vault read failed'));
			},
		};
		const result = await new ResolveMentionUseCase(faulty).query('x');
		expect(result.ok).toBe(false);
	});
});
