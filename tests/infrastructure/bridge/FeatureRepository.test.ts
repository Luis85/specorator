import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Feature, type FeaturePlainObject } from '@/domain/feature/Feature';
import { Slug } from '@/domain/shared/Slug';
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository';
import type { IWorkflowStateCodec } from '@/infrastructure/workflow-state/IWorkflowStateCodec';
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports';

function makeFeature(slugValue = 'dark-mode', title = 'Dark mode'): Feature {
	const slug = Slug.reconstitute(slugValue);
	const now = new Date('2026-01-15T00:00:00.000Z');
	return Feature.reconstitute({
		id: `id-${slugValue}`,
		slug,
		title,
		area: 'DM',
		status: 'draft',
		currentStep: 1,
		createdAt: now,
		updatedAt: now,
	});
}

/** A minimal but parser-valid workflow-state.md fixture — used to satisfy
 *  `fileExists` checks in `save()`; the stub codec controls the parsed result. */
const STUB_STATE_FILE = '---\nstub-content\n---\n';

describe('FeatureRepository (codec seam)', () => {
	let ports: FakePorts;
	let codec: IWorkflowStateCodec;
	let serializeSpy: ReturnType<typeof vi.fn<IWorkflowStateCodec['serialize']>>;
	let deserializeSpy: ReturnType<typeof vi.fn<IWorkflowStateCodec['deserialize']>>;
	let repo: FeatureRepository;

	beforeEach(() => {
		ports = fakeModulePorts();
		serializeSpy = vi
			.fn<IWorkflowStateCodec['serialize']>()
			.mockReturnValue('---\nstub\n---');
		deserializeSpy = vi.fn<IWorkflowStateCodec['deserialize']>();
		codec = { serialize: serializeSpy, deserialize: deserializeSpy };
		repo = new FeatureRepository(ports.vault, ports.settings, codec);
	});

	it('save() calls codec.serialize exactly once and returns ok with a boolean ideaCreated flag', async () => {
		const feature = makeFeature();

		const result = await repo.save(feature);

		expect(serializeSpy).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(typeof result.value.ideaCreated).toBe('boolean');
			expect(result.value.ideaCreated).toBe(true);
		}
	});

	it('save() returns err when codec.serialize throws', async () => {
		serializeSpy.mockImplementation(() => {
			throw new Error('boom');
		});
		const feature = makeFeature();

		const result = await repo.save(feature);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toBe('boom');
		}
	});

	it('save() preserves an existing idea.md and returns ideaCreated:false', async () => {
		const feature = makeFeature();
		// Pre-seed idea.md so the save() path detects overwrite-protection.
		await ports.bridge.writeFile('specs/dark-mode/idea.md', '# pre-existing idea\n');

		const result = await repo.save(feature);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.ideaCreated).toBe(false);
		}
		expect(serializeSpy).toHaveBeenCalledTimes(1);
		// idea.md content was not overwritten.
		expect(await ports.bridge.readFile('specs/dark-mode/idea.md')).toBe(
			'# pre-existing idea\n',
		);
	});

	it('findBySlug returns null and does not invoke codec when the workflow-state file is missing', async () => {
		const result = await repo.findBySlug(Slug.reconstitute('absent'));

		expect(result).toBeNull();
		expect(deserializeSpy).not.toHaveBeenCalled();
	});

	it('findBySlug throws when an extant file deserializes to null (overwrite-guard)', async () => {
		await ports.bridge.writeFile('specs/dark-mode/workflow-state.md', STUB_STATE_FILE);
		deserializeSpy.mockReturnValue(null);

		await expect(repo.findBySlug(Slug.reconstitute('dark-mode'))).rejects.toThrow(
			/could not be parsed/,
		);
		expect(deserializeSpy).toHaveBeenCalledTimes(1);
	});

	it('findAll invokes codec.deserialize exactly once per readable folder', async () => {
		// Three sibling feature folders, each with a workflow-state.md file.
		const slugs = ['alpha', 'beta', 'gamma'];
		for (const s of slugs) {
			await ports.bridge.writeFile(`specs/${s}/workflow-state.md`, STUB_STATE_FILE);
		}
		const stubFeature: FeaturePlainObject = {
			id: 'stub',
			slug: 'stub',
			title: 'Stub',
			area: 'ST',
			status: 'draft',
			currentStep: 1,
			createdAt: new Date('2026-01-15T00:00:00.000Z'),
			updatedAt: new Date('2026-01-15T00:00:00.000Z'),
		};
		deserializeSpy.mockImplementation(() =>
			Feature.reconstitute({
				...stubFeature,
				slug: Slug.reconstitute(stubFeature.slug),
			}),
		);

		const features = await repo.findAll();

		expect(deserializeSpy).toHaveBeenCalledTimes(3);
		expect(features).toHaveLength(3);
	});
});
