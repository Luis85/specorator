import { ok, err, type Result } from '@/domain/shared/Result'
import { Slug } from '@/domain/shared/Slug'
import { Feature } from '@/domain/feature/Feature'
import { isFeatureStatus } from '@/domain/feature/FeatureStatus'
import { FEATURE_STEPS, getStepMeta } from '@/domain/feature/FeatureStep'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { IBridge, PluginSettings } from './IBridge'

const META_FILE = 'workflow-state.md'

// ── Derivation helpers ────────────────────────────────────────────────────────

/** Derive a 2–5 uppercase-letter area code from a slug when none is provided. */
function deriveArea(slugValue: string): string {
	return slugValue
		.split('-')
		.map((w) => w[0]?.toUpperCase() ?? '')
		.join('')
		.slice(0, 5)
}

/**
 * Build the `artifacts:` YAML block map from the feature's current step.
 * - Steps before currentStep → `complete`
 * - currentStep = 1 (idea, draft) → `complete` (idea was formulated to create the feature)
 * - currentStep > 1 → `in-progress`
 * - Steps after currentStep → `pending`
 */
function buildArtifactsBlock(currentStep: number): string {
	return FEATURE_STEPS.map((slug, idx) => {
		const stepNum = idx + 1
		let status: string
		if (stepNum < currentStep) {
			status = 'complete'
		} else if (stepNum === currentStep) {
			status = currentStep === 1 ? 'complete' : 'in-progress'
		} else {
			status = 'pending'
		}
		return `  ${slug}: ${status}`
	}).join('\n')
}

function serializeFeature(feature: Feature): string {
	const p = feature.toPlainObject()
	// Clamp index to [0, last] so currentStep ≤ 0 or > 12 both produce a valid stage.
	const stageIndex = Math.max(0, Math.min(p.currentStep - 1, FEATURE_STEPS.length - 1))
	const currentStage = FEATURE_STEPS[stageIndex]
	// Sanitize area: keep only A-Z, apply to both user value and derived fallback,
	// then quote the scalar so the YAML value is always a safe string (never a number).
	const sanitize = (s: string) => s.replace(/[^A-Z]/g, '').slice(0, 5)
	const area = sanitize(p.area || deriveArea(p.slug)) || sanitize(deriveArea(p.slug)) || 'XX'
	const lastUpdated = p.updatedAt.toISOString().slice(0, 10)
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
	].join('\n')
}

/**
 * Parse YAML frontmatter into a flat string map.
 * Handles block maps (e.g. `artifacts:`) by skipping the parent key and
 * ignoring indented child lines — we do not need artifact statuses for
 * domain reconstitution since we derive them from `currentStep`.
 */
function parseFrontmatter(content: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content)
	if (!match) return {}

	return Object.fromEntries(
		match[1].split('\n').flatMap((line) => {
			// Skip indented lines (block map child values)
			if (line.startsWith(' ') || line.startsWith('\t')) return []
			const colonIdx = line.indexOf(':')
			if (colonIdx === -1) return []
			const key = line.slice(0, colonIdx).trim()
			const raw = line.slice(colonIdx + 1).trim()
			// Skip keys with no inline value (block map parents like `artifacts:`)
			if (!raw) return []
			const value = raw.startsWith('"')
				? raw.slice(1, raw.lastIndexOf('"')).replace(/\\"/g, '"')
				: raw
			return [[key, value]]
		}),
	)
}

function deserializeFeature(content: string): Feature | null {
	const data = parseFrontmatter(content)

	// `feature:` is canonical; `title:` is kept as backward-compat fallback
	const title = data.feature || data.title
	if (!data.id || !title || !data.slug || !data.status || !data.currentStep) return null
	if (!isFeatureStatus(data.status)) return null

	const slug = Slug.reconstitute(data.slug)
	const currentStep = parseInt(data.currentStep, 10)
	if (isNaN(currentStep)) return null

	return Feature.reconstitute({
		id: data.id,
		slug,
		title,
		area: data.area || '',
		status: data.status,
		currentStep,
		createdAt: new Date(data.createdAt ?? Date.now()),
		updatedAt: new Date(data.updatedAt ?? Date.now()),
	})
}

/** Build a minimal stage artifact stub compatible with agentic-workflow conventions. */
function buildStageStub(stageName: string, slugValue: string, featureTitle: string, date: string): string {
	return [
		'---',
		`stage: ${stageName}`,
		`feature: ${slugValue}`,
		`status: in-progress`,
		`created: ${date}`,
		'---',
		'',
		`<!-- ${stageName.charAt(0).toUpperCase() + stageName.slice(1).replace(/-/g, ' ')} artifact for ${featureTitle}. -->`,
		'',
	].join('\n')
}

// ── Repository ────────────────────────────────────────────────────────────────

export class FeatureRepository implements IFeatureRepository {
	constructor(
		private readonly bridge: IBridge,
		private readonly settings: PluginSettings,
	) {}

	private metaPath(slugValue: string): string {
		return `${this.settings.specsFolder}/${slugValue}/${META_FILE}`
	}

	private stagePath(slugValue: string, stageName: string): string {
		return `${this.settings.specsFolder}/${slugValue}/${stageName}.md`
	}

	async findAll(): Promise<Feature[]> {
		const folders = await this.bridge.listFolders(this.settings.specsFolder)
		const features = await Promise.all(
			folders.map(async (folder) => {
				const path = `${this.settings.specsFolder}/${folder}/${META_FILE}`
				try {
					const content = await this.bridge.readFile(path)
					return deserializeFeature(content)
				} catch {
					return null
				}
			}),
		)
		return features.filter((f): f is Feature => f !== null)
	}

	async findBySlug(slug: Slug): Promise<Feature | null> {
		const path = this.metaPath(slug.toString())
		if (!(await this.bridge.fileExists(path))) return null
		const content = await this.bridge.readFile(path)
		const feature = deserializeFeature(content)
		// File exists but is malformed — throw so callers cannot silently overwrite it.
		if (feature === null) {
			throw new Error(`Spec at "${path}" exists but could not be parsed — will not overwrite.`)
		}
		return feature
	}

	async findById(id: string): Promise<Feature | null> {
		const all = await this.findAll()
		return all.find((f) => f.id === id) ?? null
	}

	/**
	 * Upsert: write workflow-state.md for a new or updated feature.
	 * On first creation (file did not exist), also writes the idea.md stub.
	 */
	async save(feature: Feature): Promise<Result<void>> {
		try {
			const folder = `${this.settings.specsFolder}/${feature.slug.toString()}`
			await this.bridge.createFolder(folder)
			const path = this.metaPath(feature.slug.toString())
			const isNew = !(await this.bridge.fileExists(path))
			await this.bridge.writeFile(path, serializeFeature(feature))
			if (isNew) {
				const ideaPath = this.stagePath(feature.slug.toString(), 'idea')
				if (await this.bridge.fileExists(ideaPath)) {
					this.bridge.showNotice(
						`Specorator: idea.md already exists — keeping your version.`,
					)
				} else {
					const date = feature.createdAt.toISOString().slice(0, 10)
					await this.bridge.writeFile(ideaPath, buildStageStub('idea', feature.slug.toString(), feature.title, date))
				}
			}
			return ok(undefined)
		} catch (e) {
			return err(e instanceof Error ? e : new Error(String(e)))
		}
	}

	/**
	 * Create the stage artifact file for the given step number, if it does not
	 * already exist. Shows a notice and returns ok (without writing) if the file
	 * is already present, preserving any manually edited content (REQ-AVS-005).
	 */
	async createStageFile(feature: Feature, stepNumber: number): Promise<Result<void>> {
		try {
			const meta = getStepMeta(stepNumber)
			if (!meta) return err(new Error(`Unknown step number: ${stepNumber}`))

			const path = this.stagePath(feature.slug.toString(), meta.slug)
			if (await this.bridge.fileExists(path)) {
				this.bridge.showNotice(
					`Specorator: ${meta.slug}.md already exists — keeping your version.`,
				)
				return ok(undefined)
			}
			const date = new Date().toISOString().slice(0, 10)
			await this.bridge.writeFile(path, buildStageStub(meta.slug, feature.slug.toString(), feature.title, date))
			return ok(undefined)
		} catch (e) {
			return err(e instanceof Error ? e : new Error(String(e)))
		}
	}

	async delete(id: string): Promise<Result<void>> {
		try {
			const feature = await this.findById(id)
			if (!feature) return err(new Error(`Feature "${id}" not found`))
			await this.bridge.deleteFile(this.metaPath(feature.slug.toString()))
			return ok(undefined)
		} catch (e) {
			return err(e instanceof Error ? e : new Error(String(e)))
		}
	}
}
