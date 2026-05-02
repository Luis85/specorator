import { ok, err, type Result } from '@/domain/shared/Result'
import { Slug } from '@/domain/shared/Slug'
import { Feature } from '@/domain/feature/Feature'
import { isFeatureStatus } from '@/domain/feature/FeatureStatus'
import { FEATURE_STEPS } from '@/domain/feature/FeatureStep'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { IBridge, PluginSettings } from './IBridge'

const META_FILE = 'workflow-state.md'

function serializeFeature(feature: Feature): string {
	const p = feature.toPlainObject()
	const currentStage = FEATURE_STEPS[p.currentStep - 1] ?? 'idea'
	return [
		'---',
		`id: ${p.id}`,
		`slug: ${p.slug}`,
		`feature: "${p.title.replace(/"/g, '\\"')}"`,
		`title: "${p.title.replace(/"/g, '\\"')}"`,
		`area: ""`,
		`status: ${p.status}`,
		`currentStep: ${p.currentStep}`,
		`current_stage: ${currentStage}`,
		`last_updated: ${p.updatedAt.toISOString()}`,
		`last_agent: ""`,
		`artifacts: []`,
		`createdAt: ${p.createdAt.toISOString()}`,
		`updatedAt: ${p.updatedAt.toISOString()}`,
		'---',
		'',
	].join('\n')
}

function parseFrontmatter(content: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content)
	if (!match) return {}

	return Object.fromEntries(
		match[1].split('\n').flatMap((line) => {
			const colonIdx = line.indexOf(':')
			if (colonIdx === -1) return []
			const key = line.slice(0, colonIdx).trim()
			const raw = line.slice(colonIdx + 1).trim()
			const value = raw.startsWith('"')
				? raw.slice(1, raw.lastIndexOf('"')).replace(/\\"/g, '"')
				: raw
			return [[key, value]]
		}),
	)
}

function deserializeFeature(content: string): Feature | null {
	const data = parseFrontmatter(content)

	const title = data.title || data.feature
	if (!data.id || !title || !data.slug || !data.status || !data.currentStep) return null
	if (!isFeatureStatus(data.status)) return null

	const slug = Slug.reconstitute(data.slug)
	const currentStep = parseInt(data.currentStep, 10)
	if (isNaN(currentStep)) return null

	return Feature.reconstitute({
		id: data.id,
		slug,
		title,
		status: data.status,
		currentStep,
		createdAt: new Date(data.createdAt ?? Date.now()),
		updatedAt: new Date(data.updatedAt ?? Date.now()),
	})
}

export class FeatureRepository implements IFeatureRepository {
	constructor(
		private readonly bridge: IBridge,
		private readonly settings: PluginSettings,
	) {}

	private metaPath(slugValue: string): string {
		return `${this.settings.specsFolder}/${slugValue}/${META_FILE}`
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
		return deserializeFeature(content)
	}

	async findById(id: string): Promise<Feature | null> {
		const all = await this.findAll()
		return all.find((f) => f.id === id) ?? null
	}

	async save(feature: Feature): Promise<Result<void>> {
		try {
			const folder = `${this.settings.specsFolder}/${feature.slug.toString()}`
			await this.bridge.createFolder(folder)
			const path = this.metaPath(feature.slug.toString())
			if (await this.bridge.fileExists(path)) {
				this.bridge.showNotice(
					`Spec "${feature.slug.toString()}" already exists — skipping overwrite.`,
				)
				return err(new Error(`Spec "${feature.slug.toString()}" already exists`))
			}
			await this.bridge.writeFile(path, serializeFeature(feature))
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
