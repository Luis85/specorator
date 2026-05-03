import { Feature } from '@/domain/feature/Feature';
import { isFeatureStatus } from '@/domain/feature/FeatureStatus';
import { FEATURE_STEPS } from '@/domain/feature/FeatureStep';
import { Slug } from '@/domain/shared/Slug';

/** Derive a 2-5 uppercase-letter area code from a slug when none is provided. */
function deriveArea(slugValue: string): string {
	return slugValue
		.split('-')
		.map((w) => w[0]?.toUpperCase() ?? '')
		.join('')
		.slice(0, 5);
}

function buildArtifactsBlock(currentStep: number): string {
	const effective = Math.max(1, currentStep);
	return FEATURE_STEPS.map((slug, idx) => {
		const stepNum = idx + 1;
		let status: string;
		if (stepNum < effective) {
			status = 'complete';
		} else if (stepNum === effective) {
			status = effective === 1 ? 'complete' : 'in-progress';
		} else {
			status = 'pending';
		}
		return `  ${slug}: ${status}`;
	}).join('\n');
}

export function serializeWorkflowState(feature: Feature): string {
	const p = feature.toPlainObject();
	const stageIndex = Math.max(0, Math.min(p.currentStep - 1, FEATURE_STEPS.length - 1));
	const currentStage = FEATURE_STEPS[stageIndex];
	const sanitize = (s: string) => s.replace(/[^A-Z]/g, '').slice(0, 5);
	const area = sanitize(p.area || deriveArea(p.slug)) || sanitize(deriveArea(p.slug)) || 'XX';
	const lastUpdated = p.updatedAt.toISOString().slice(0, 10);

	return [
		'---',
		`id: ${p.id}`,
		`slug: ${p.slug}`,
		`feature: "${p.title.replace(/"/g, '\\"')}"`,
		`area: "${area}"`,
		`status: ${p.status}`,
		`currentStep: ${p.currentStep}`,
		`current_stage: ${currentStage}`,
		`last_updated: ${lastUpdated}`,
		`last_agent: ""`,
		`artifacts:`,
		buildArtifactsBlock(p.currentStep),
		`createdAt: ${p.createdAt.toISOString()}`,
		`updatedAt: ${p.updatedAt.toISOString()}`,
		'---',
		'',
	].join('\n');
}

function parseWorkflowStateFrontmatter(content: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match) return {};

	let inArtifactsBlock = false;
	return Object.fromEntries(
		match[1].split('\n').flatMap((line) => {
			const isIndented = line.startsWith(' ') || line.startsWith('\t');
			if (inArtifactsBlock) {
				if (isIndented) return [];
				inArtifactsBlock = false;
			}

			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) return [];
			const key = line.slice(0, colonIdx).trim();
			const raw = line.slice(colonIdx + 1).trim();
			if (!raw) {
				if (key === 'artifacts') inArtifactsBlock = true;
				return [];
			}

			const value = parseScalar(raw);
			return [[key, value]];
		}),
	);
}

function parseScalar(raw: string): string {
	if (raw.startsWith('"')) return raw.slice(1, raw.lastIndexOf('"')).replace(/\\"/g, '"');
	if (raw.startsWith("'")) return raw.slice(1, raw.lastIndexOf("'")).replace(/''/g, "'");
	return raw;
}

export function deserializeWorkflowState(content: string): Feature | null {
	const data = parseWorkflowStateFrontmatter(content);

	const title = data.feature || data.title;
	if (!data.id || !title || !data.slug || !data.status || !data.currentStep) return null;
	if (!isFeatureStatus(data.status)) return null;

	const slug = Slug.reconstitute(data.slug);
	const currentStep = parseInt(data.currentStep, 10);
	if (isNaN(currentStep)) return null;

	return Feature.reconstitute({
		id: data.id,
		slug,
		title,
		area: data.area || '',
		status: data.status,
		currentStep,
		createdAt: new Date(data.createdAt ?? Date.now()),
		updatedAt: new Date(data.updatedAt ?? Date.now()),
	});
}
