import { Feature } from '@/domain/feature/Feature';
import { isFeatureStatus, type FeatureStatus } from '@/domain/feature/FeatureStatus';
import { FEATURE_STEPS } from '@/domain/feature/FeatureStep';
import { Slug } from '@/domain/shared/Slug';

/** Derive a 2-5 uppercase-letter area code from a slug when none is provided. */
function deriveArea(slugValue: string): string {
	return slugValue
		.split('-')
		.map((w) => w.charAt(0).toUpperCase())
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

function parseWorkflowStateFrontmatter(content: string): Partial<Record<string, string>> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	const body = match?.[1];
	if (body === undefined) return {};

	let inArtifactsBlock = false;
	return Object.fromEntries(
		body.split('\n').flatMap((line) => {
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

interface ValidatedWorkflowState {
	id: string;
	slug: string;
	title: string;
	area: string;
	status: FeatureStatus;
	currentStep: number;
	createdAt: string | undefined;
	updatedAt: string | undefined;
}

function asFeatureStatus(value: string | undefined): FeatureStatus | undefined {
	return value !== undefined && isFeatureStatus(value) ? value : undefined;
}

function asRequiredScalar(value: string | undefined): string | undefined {
	return value !== undefined && value.trim() !== '' ? value : undefined;
}

function validateWorkflowFrontmatter(
	data: Partial<Record<string, string>>,
): ValidatedWorkflowState | null {
	const id = asRequiredScalar(data.id);
	const slug = asRequiredScalar(data.slug);
	const title = asRequiredScalar(data.feature ?? data.title);
	const status = asFeatureStatus(data.status);
	const stepRaw = data.currentStep;
	const currentStep = stepRaw !== undefined ? parseInt(stepRaw, 10) : NaN;

	if (
		id === undefined ||
		title === undefined ||
		slug === undefined ||
		status === undefined ||
		Number.isNaN(currentStep)
	) {
		return null;
	}
	return {
		id,
		slug,
		title,
		area: data.area ?? '',
		status,
		currentStep,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
	};
}

export function deserializeWorkflowState(content: string): Feature | null {
	const validated = validateWorkflowFrontmatter(parseWorkflowStateFrontmatter(content));
	if (validated === null) return null;

	return Feature.reconstitute({
		id: validated.id,
		slug: Slug.reconstitute(validated.slug),
		title: validated.title,
		area: validated.area,
		status: validated.status,
		currentStep: validated.currentStep,
		createdAt: new Date(validated.createdAt ?? Date.now()),
		updatedAt: new Date(validated.updatedAt ?? Date.now()),
	});
}
