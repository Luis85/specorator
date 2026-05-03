import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Feature } from '@/domain/feature/Feature';
import { Slug } from '@/domain/shared/Slug';
import { deserializeWorkflowState, serializeWorkflowState } from '@/infrastructure/workflow-state/WorkflowStateDocument';

function fixture(name: string): string {
	return readFileSync(
		resolve(process.cwd(), 'src/infrastructure/workflow-state/__fixtures__', name),
		'utf8',
	);
}

describe('WorkflowStateDocument', () => {
	it('parses the canonical fixture', () => {
		const feature = deserializeWorkflowState(fixture('valid-workflow-state.md'));

		expect(feature?.id).toBe('fixture-id');
		expect(feature?.title).toBe('Dark mode');
		expect(feature?.slug.toString()).toBe('dark-mode');
		expect(feature?.currentStep).toBe(2);
		expect(feature?.status).toBe('active');
	});

	it('rejects malformed workflow-state content', () => {
		expect(deserializeWorkflowState(fixture('malformed-workflow-state.md'))).toBeNull();
	});

	it('rejects workflow-state data with an unknown status', () => {
		const content = fixture('valid-workflow-state.md').replace('status: active', 'status: paused');

		expect(deserializeWorkflowState(content)).toBeNull();
	});

	it.each([
		['id', 'id: fixture-id', 'id: ""'],
		['slug', 'slug: dark-mode', 'slug: ""'],
		['feature', "feature: 'Dark mode'", 'feature: ""'],
		['title', "feature: 'Dark mode'", 'title: ""'],
	])('rejects workflow-state data with an empty %s field', (_field, original, replacement) => {
		const content = fixture('valid-workflow-state.md').replace(original, replacement);

		expect(deserializeWorkflowState(content)).toBeNull();
	});

	it('serializes a valid workflow-state document', () => {
		const slug = Slug.reconstitute('quoted-title');
		const feature = Feature.reconstitute({
			id: 'serialize-id',
			slug,
			title: 'Quoted "Title"',
			area: 'QT',
			status: 'draft',
			currentStep: 1,
			createdAt: new Date('2026-05-03T10:00:00.000Z'),
			updatedAt: new Date('2026-05-03T11:00:00.000Z'),
		});

		const content = serializeWorkflowState(feature);

		expect(content).toContain('feature: "Quoted \\"Title\\""');
		expect(content).toContain('area: "QT"');
		expect(content).toContain('current_stage: idea');
		expect(content).toContain('  idea: complete');
		expect(deserializeWorkflowState(content)?.id).toBe('serialize-id');
	});
});
