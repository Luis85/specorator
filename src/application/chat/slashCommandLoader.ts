import type { VaultPort, LoggerPort } from '@/domain/ports';
import type { SlashCommand } from '@/domain/chat/SlashCommand';

/**
 * Vault-loaded slash command parsed from `.claude/commands/*.md` (a "command")
 * or `.claude/skills/<slug>/SKILL.md` (a "skill"). Mirrors Claudian's pattern:
 * each file carries YAML frontmatter describing the command, followed by a
 * body that becomes the prompt template when the user picks the entry.
 *
 * Commands are scanned flat (`.claude/commands/*.md`). Skills use the
 * directory layout documented in `AGENTS.md` — each skill lives under
 * `.claude/skills/<slug>/SKILL.md`, so the loader enumerates child folders
 * and reads each folder's `SKILL.md` if present. Skill folders without a
 * `SKILL.md` are skipped silently with a `debug` breadcrumb.
 *
 * Frontmatter contract (matches Claudian):
 *   description           — short subtitle for the palette (required)
 *   argument-hint         — placeholder hint, rendered after the description
 *   allowed-tools         — list of tools the prompt expects
 *   model                 — model name override
 *   disable-model-invocation — skills with this `true` are skipped
 *   user-invocable        — commands/skills with this `false` are skipped
 *   context               — context-mode hint (e.g. `'fork'`)
 *   agent                 — agent persona hint
 *
 * Files with unparseable frontmatter, missing `description`, or
 * `user-invocable: false` are silently skipped with a `loggerPort.warn`
 * breadcrumb. Skills with `disable-model-invocation: true` are also skipped.
 *
 * Stays in the application layer (ADR-008): depends only on `VaultPort` +
 * `LoggerPort`; no `obsidian` imports.
 */
export interface VaultSlashCommand {
	readonly source: 'vault-command' | 'vault-skill';
	/** Stable unique id — `commands:<slug>` or `skills:<slug>`. */
	readonly id: string;
	/** File basename without `.md`. */
	readonly name: string;
	/** One-line description from frontmatter. */
	readonly description: string;
	/** Prompt body — the markdown after the frontmatter block. */
	readonly body: string;
	readonly argumentHint?: string;
	readonly allowedTools?: readonly string[];
	readonly model?: string;
	readonly disableModelInvocation?: boolean;
	readonly userInvocable?: boolean;
	readonly context?: string;
	readonly agent?: string;
}

const COMMANDS_FOLDER = '.claude/commands';
const SKILLS_FOLDER = '.claude/skills';
const SKILL_MANIFEST = 'SKILL.md';

/**
 * Load all vault slash commands and skills. Resolves to an empty array when
 * neither folder exists (a brand-new vault has no `.claude/` dir).
 *
 * Per-file failures (read error, malformed frontmatter, missing description,
 * disabled flags) are logged via `loggerPort.warn` and dropped from the result.
 * A single bad file never poisons the whole scan.
 */
export async function loadVaultSlashCommands(
	vault: VaultPort,
	loggerPort?: LoggerPort,
): Promise<readonly VaultSlashCommand[]> {
	const commandFiles = await listMarkdownFilesSafe(vault, COMMANDS_FOLDER, loggerPort);
	const skillFiles = await listSkillManifestsSafe(vault, SKILLS_FOLDER, loggerPort);

	const results: VaultSlashCommand[] = [];
	for (const path of commandFiles) {
		const cmd = await loadOne(vault, path, 'vault-command', loggerPort);
		if (cmd !== null) results.push(cmd);
	}
	for (const path of skillFiles) {
		const cmd = await loadOne(vault, path, 'vault-skill', loggerPort);
		if (cmd !== null) results.push(cmd);
	}
	return Object.freeze(results);
}

async function listMarkdownFilesSafe(
	vault: VaultPort,
	folder: string,
	logger: LoggerPort | undefined,
): Promise<readonly string[]> {
	const files = await safeListFiles(vault, folder);
	if (files === null) {
		logger?.debug('loadVaultSlashCommands: folder not listable', { folder });
		return [];
	}
	return files.filter((p) => p.endsWith('.md'));
}

/**
 * Enumerate skill folders under `parent` and return the `<folder>/SKILL.md`
 * path for each folder that actually contains a `SKILL.md`. Skill folders
 * without a manifest are skipped silently with a `debug` breadcrumb — matches
 * the directory layout documented in `AGENTS.md` (e.g.
 * `.claude/skills/publish-release/SKILL.md`).
 */
async function listSkillManifestsSafe(
	vault: VaultPort,
	parent: string,
	logger: LoggerPort | undefined,
): Promise<readonly string[]> {
	const folders = await safeListFolders(vault, parent);
	if (folders === null) {
		logger?.debug('loadVaultSlashCommands: skills folder not listable', { folder: parent });
		return [];
	}
	const manifests: string[] = [];
	for (const folder of folders) {
		const manifestPath = `${parent}/${folder}/${SKILL_MANIFEST}`;
		const exists = await Promise.resolve()
			.then(() => vault.fileExists(manifestPath))
			.catch(() => false);
		if (exists) {
			manifests.push(manifestPath);
		} else {
			logger?.debug('loadVaultSlashCommands: skill folder missing SKILL.md', {
				folder: `${parent}/${folder}`,
			});
		}
	}
	return manifests;
}

/**
 * Wrap `vault.listFiles` so a missing folder does not surface as a thrown
 * error. Returns `null` on any failure (folder absent, permissions, …) — the
 * caller treats `null` as an empty folder.
 */
async function safeListFiles(vault: VaultPort, folder: string): Promise<readonly string[] | null> {
	const recovered = await Promise.resolve()
		.then(() => vault.listFiles(folder))
		.catch(() => null);
	return recovered;
}

/**
 * Wrap `vault.listFolders` so a missing parent folder does not surface as a
 * thrown error. Returns `null` on any failure — the caller treats `null` as
 * an empty folder.
 */
async function safeListFolders(
	vault: VaultPort,
	parent: string,
): Promise<readonly string[] | null> {
	const recovered = await Promise.resolve()
		.then(() => vault.listFolders(parent))
		.catch(() => null);
	return recovered;
}

/**
 * Stage 1 of `loadOne`: read the file + parse frontmatter. Returns `null`
 * (and logs a warn) on a read failure or unparseable frontmatter block.
 */
async function readAndParseFrontmatter(
	vault: VaultPort,
	path: string,
	logger: LoggerPort | undefined,
): Promise<ParsedFrontmatter | null> {
	const content = await Promise.resolve()
		.then(() => vault.readFile(path))
		.catch(() => null);
	if (content === null) {
		logger?.warn('loadVaultSlashCommands: failed to read file', { path });
		return null;
	}
	const parsed = parseFrontmatter(content);
	if (parsed === null) {
		logger?.warn('loadVaultSlashCommands: malformed frontmatter', { path });
		return null;
	}
	return parsed;
}

/**
 * Stage 2 of `loadOne`: apply visibility gates. Returns `null` when the file
 * should be skipped (missing description, `user-invocable: false`, or a skill
 * with `disable-model-invocation: true`).
 */
function applyVisibilityGates(
	frontmatter: ReadonlyMap<string, string>,
	source: 'vault-command' | 'vault-skill',
	path: string,
	logger: LoggerPort | undefined,
): {
	description: string;
	userInvocable: boolean;
	disableModelInvocation: boolean | undefined;
} | null {
	const description = readScalar(frontmatter, 'description');
	if (description === undefined || description === '') {
		logger?.warn('loadVaultSlashCommands: missing description', { path });
		return null;
	}
	const userInvocable = parseBoolean(readScalar(frontmatter, 'user-invocable')) ?? true;
	if (userInvocable === false) {
		logger?.debug('loadVaultSlashCommands: user-invocable=false; skipping', { path });
		return null;
	}
	const disableModelInvocation = parseBoolean(readScalar(frontmatter, 'disable-model-invocation'));
	if (source === 'vault-skill' && disableModelInvocation === true) {
		logger?.debug('loadVaultSlashCommands: disable-model-invocation=true; skipping skill', {
			path,
		});
		return null;
	}
	return { description, userInvocable, disableModelInvocation };
}

/**
 * Read + parse a single slash-command file. Returns `null` (and logs a warn)
 * when the file is unreadable, has malformed frontmatter, is missing a
 * description, or has been explicitly disabled. Split into two helpers to
 * keep the per-function complexity below the project lint cap.
 */
async function loadOne(
	vault: VaultPort,
	path: string,
	source: 'vault-command' | 'vault-skill',
	logger: LoggerPort | undefined,
): Promise<VaultSlashCommand | null> {
	const parsed = await readAndParseFrontmatter(vault, path, logger);
	if (parsed === null) return null;
	const gated = applyVisibilityGates(parsed.frontmatter, source, path, logger);
	if (gated === null) return null;

	const name = source === 'vault-skill' ? skillSlugFromPath(path) : basenameWithoutExt(path);
	const slugKey = source === 'vault-command' ? 'commands' : 'skills';
	const command: VaultSlashCommand = {
		source,
		id: `${slugKey}:${name}`,
		name,
		description: gated.description,
		body: parsed.body,
		argumentHint: readScalar(parsed.frontmatter, 'argument-hint'),
		allowedTools: readList(parsed.frontmatter, 'allowed-tools'),
		model: readScalar(parsed.frontmatter, 'model'),
		disableModelInvocation: gated.disableModelInvocation,
		userInvocable: gated.userInvocable,
		context: readScalar(parsed.frontmatter, 'context'),
		agent: readScalar(parsed.frontmatter, 'agent'),
	};
	return Object.freeze(command);
}

interface ParsedFrontmatter {
	readonly frontmatter: ReadonlyMap<string, string>;
	readonly body: string;
}

/**
 * Hand-rolled YAML reader tuned to the slash-command frontmatter shape (flat
 * scalars + optional list values). Mirrors the pattern in
 * `src/infrastructure/workflow-state/WorkflowStateDocument.ts`.
 *
 * Returns `null` when the document does not start with `---` (no frontmatter
 * block at all) or the closing fence is missing. List values are stored as
 * the raw line and parsed lazily by `readList`.
 */
function parseFrontmatter(content: string): ParsedFrontmatter | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
	if (match === null) return null;
	const rawFm = match[1];
	const body = match[2];
	const map = collectScalars(rawFm);
	return { frontmatter: map, body: body.replace(/^\r?\n/, '') };
}

function collectScalars(rawFrontmatter: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const line of rawFrontmatter.split(/\r?\n/)) {
		if (!isCandidateLine(line)) continue;
		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		const raw = line.slice(colonIdx + 1).trim();
		map.set(key, raw);
	}
	return map;
}

function isCandidateLine(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed === '') return false;
	if (trimmed.startsWith('#')) return false;
	// Flat-frontmatter only — skip nested (indented) keys.
	if (line.startsWith(' ') || line.startsWith('\t')) return false;
	return true;
}

function readScalar(fm: ReadonlyMap<string, string>, key: string): string | undefined {
	const raw = fm.get(key);
	if (raw === undefined) return undefined;
	return unquote(raw);
}

function readList(fm: ReadonlyMap<string, string>, key: string): readonly string[] | undefined {
	const raw = fm.get(key);
	if (raw === undefined) return undefined;
	// Flow form: `[A, B, C]` — block-form lists across multiple lines are not
	// supported here; commands/skills produced by Claudian always use the
	// flow form for tool lists.
	const trimmed = raw.trim();
	if (trimmed === '' || trimmed === '[]') return [];
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		return trimmed
			.slice(1, -1)
			.split(',')
			.map((p) => unquote(p.trim()))
			.filter((p) => p !== '');
	}
	// Comma-separated unbracketed fallback.
	return trimmed
		.split(',')
		.map((p) => unquote(p.trim()))
		.filter((p) => p !== '');
}

function unquote(raw: string): string {
	if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
		return raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
	}
	if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
		return raw.slice(1, -1).replace(/''/g, "'");
	}
	return raw;
}

function parseBoolean(raw: string | undefined): boolean | undefined {
	if (raw === undefined) return undefined;
	const lowered = raw.toLowerCase();
	if (lowered === 'true') return true;
	if (lowered === 'false') return false;
	return undefined;
}

function basenameWithoutExt(path: string): string {
	const slash = path.lastIndexOf('/');
	const base = slash === -1 ? path : path.slice(slash + 1);
	const dot = base.lastIndexOf('.');
	return dot === -1 ? base : base.slice(0, dot);
}

/**
 * Derive a skill slug from its manifest path. For
 * `.claude/skills/<slug>/SKILL.md` the slug is the parent folder name.
 * Falls back to the basename if the path does not match the expected shape
 * (defensive — the loader should never reach this branch in production).
 */
function skillSlugFromPath(path: string): string {
	const segments = path.split('/').filter((s) => s !== '');
	if (segments.length >= 2 && segments[segments.length - 1].toLowerCase() === 'skill.md') {
		return segments[segments.length - 2];
	}
	return basenameWithoutExt(path);
}

/**
 * Adapt a `VaultSlashCommand` into the UI-facing `SlashCommand` DTO. Lives
 * here so the UI does not have to know about the loader's internal shape.
 */
export function toSlashCommand(v: VaultSlashCommand): SlashCommand {
	return Object.freeze({
		name: v.name,
		description: v.description,
		kind: v.source,
		action: 'vault-prompt' as const,
		body: v.body,
		argumentHint: v.argumentHint,
		allowedTools: v.allowedTools,
		model: v.model,
		context: v.context,
		agent: v.agent,
	});
}
