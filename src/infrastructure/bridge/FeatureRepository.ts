import { ok, err, type Result } from '@/domain/shared/Result';
import type { Slug } from '@/domain/shared/Slug';
import type { Feature } from '@/domain/feature/Feature';
import { getStepMeta } from '@/domain/feature/FeatureStep';
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository';
import type { VaultPort, NotificationPort } from '@/domain/ports';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { joinVaultPath } from '../vault/VaultPath';
import {
	deserializeWorkflowState,
	serializeWorkflowState,
} from '../workflow-state/WorkflowStateDocument';

const META_FILE = 'workflow-state.md';

/** Build a minimal stage artifact stub compatible with agentic-workflow conventions. */
function buildStageStub(
	stageName: string,
	slugValue: string,
	featureTitle: string,
	date: string,
): string {
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
	].join('\n');
}

// ── Repository ────────────────────────────────────────────────────────────────

export class FeatureRepository implements IFeatureRepository {
	constructor(
		private readonly vault: VaultPort,
		private readonly notifications: NotificationPort,
		private readonly getSettings: () => PluginSettings,
	) {}

	private checkedPath(...segments: string[]): string {
		const path = joinVaultPath(...segments);
		if (!path.ok) throw path.error;
		return path.value;
	}

	private folderPath(specsFolder: string, slugValue: string): string {
		return this.checkedPath(specsFolder, slugValue);
	}

	private metaPath(specsFolder: string, slugValue: string): string {
		return this.checkedPath(specsFolder, slugValue, META_FILE);
	}

	private stagePath(specsFolder: string, slugValue: string, stageName: string): string {
		return this.checkedPath(specsFolder, slugValue, `${stageName}.md`);
	}

	async findAll(): Promise<Feature[]> {
		const specsFolder = this.checkedPath(this.getSettings().specsFolder);
		const folders = await this.vault.listFolders(specsFolder);
		const features = await Promise.all(
			folders.map(async (folder) => {
				const path = this.checkedPath(specsFolder, folder, META_FILE);
				try {
					const content = await this.vault.readFile(path);
					return deserializeWorkflowState(content);
				} catch {
					return null;
				}
			}),
		);
		return features.filter((f): f is Feature => f !== null);
	}

	async findBySlug(slug: Slug): Promise<Feature | null> {
		const specsFolder = this.getSettings().specsFolder;
		const path = this.metaPath(specsFolder, slug.toString());
		if (!(await this.vault.fileExists(path))) return null;
		const content = await this.vault.readFile(path);
		const feature = deserializeWorkflowState(content);
		// File exists but is malformed — throw so callers cannot silently overwrite it.
		if (feature === null) {
			throw new Error(`Spec at "${path}" exists but could not be parsed — will not overwrite.`);
		}
		return feature;
	}

	async findById(id: string): Promise<Feature | null> {
		const all = await this.findAll();
		return all.find((f) => f.id === id) ?? null;
	}

	/**
	 * Upsert: write workflow-state.md for a new or updated feature.
	 * On first creation (file did not exist), also writes the idea.md stub.
	 */
	async save(feature: Feature): Promise<Result<void>> {
		// Snapshot specsFolder once so all paths in this multi-step write resolve
		// to the same root, even if the user changes the setting mid-flight.
		const specsFolder = this.getSettings().specsFolder;
		try {
			const folder = this.folderPath(specsFolder, feature.slug.toString());
			await this.vault.createFolder(folder);
			const path = this.metaPath(specsFolder, feature.slug.toString());
			const isNew = !(await this.vault.fileExists(path));
			if (!isNew && deserializeWorkflowState(await this.vault.readFile(path)) === null) {
				return err(
					new Error(`Spec at "${path}" exists but could not be parsed — will not overwrite.`),
				);
			}
			// On first creation, write idea.md before workflow-state.md so the
			// operation is retry-safe.  idea.md creation is idempotent (preserves
			// an existing file and returns ok), so if workflow-state.md then fails
			// to write, workflow-state.md is still absent and findBySlug returns
			// null — CreateFeatureUseCase can retry without hitting the duplicate
			// check.  If we wrote workflow-state.md first, an idea.md failure
			// would leave a valid metadata file and block any retry.
			if (isNew) {
				const ideaPath = this.stagePath(specsFolder, feature.slug.toString(), 'idea');
				if (await this.vault.fileExists(ideaPath)) {
					this.notifications.showInfo(`Specorator: idea.md already exists — keeping your version.`);
				} else {
					const date = feature.createdAt.toISOString().slice(0, 10);
					await this.vault.writeFile(
						ideaPath,
						buildStageStub('idea', feature.slug.toString(), feature.title, date),
					);
				}
			}
			await this.vault.writeFile(path, serializeWorkflowState(feature));
			return ok(undefined);
		} catch (e) {
			return err(e instanceof Error ? e : new Error(String(e)));
		}
	}

	/**
	 * Create the stage artifact file for the given step number, if it does not
	 * already exist. Shows a notice and returns ok (without writing) if the file
	 * is already present, preserving any manually edited content (REQ-AVS-005).
	 */
	async createStageFile(feature: Feature, stepNumber: number): Promise<Result<void>> {
		const specsFolder = this.getSettings().specsFolder;
		try {
			const meta = getStepMeta(stepNumber);
			if (!meta) return err(new Error(`Unknown step number: ${stepNumber}`));

			const path = this.stagePath(specsFolder, feature.slug.toString(), meta.slug);
			if (await this.vault.fileExists(path)) {
				this.notifications.showInfo(
					`Specorator: ${meta.slug}.md already exists — keeping your version.`,
				);
				return ok(undefined);
			}
			const date = new Date().toISOString().slice(0, 10);
			await this.vault.writeFile(
				path,
				buildStageStub(meta.slug, feature.slug.toString(), feature.title, date),
			);
			return ok(undefined);
		} catch (e) {
			return err(e instanceof Error ? e : new Error(String(e)));
		}
	}

	async delete(id: string): Promise<Result<void>> {
		const specsFolder = this.getSettings().specsFolder;
		try {
			const feature = await this.findById(id);
			if (!feature) return err(new Error(`Feature "${id}" not found`));
			const folder = this.folderPath(specsFolder, feature.slug.toString());
			const files = await this.vault.listFiles(folder);
			await Promise.all(files.map((path) => this.vault.deleteFile(path)));
			return ok(undefined);
		} catch (e) {
			return err(e instanceof Error ? e : new Error(String(e)));
		}
	}
}
