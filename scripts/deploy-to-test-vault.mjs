#!/usr/bin/env node
// W12 — copy built plugin output into a local Obsidian test vault.
// Usage: SPECORATOR_TEST_VAULT=/path/to/vault npm run build:deploy
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathExists } from './_utils.mjs';

const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];

export const VAULT_ENV_VAR = 'SPECORATOR_TEST_VAULT';

export async function readPluginId(repoRoot) {
	const manifestPath = path.join(repoRoot, 'manifest.json');
	const raw = await readFile(manifestPath, 'utf8');
	const manifest = JSON.parse(raw);
	if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
		throw new Error(`manifest.json missing required string "id" at ${manifestPath}`);
	}
	return manifest.id;
}

export function resolveTargetDir(vaultPath, pluginId) {
	return path.join(vaultPath, '.obsidian', 'plugins', pluginId);
}

export async function deployToVault({ repoRoot, vaultPath, log = () => {} }) {
	if (typeof vaultPath !== 'string' || vaultPath.length === 0) {
		throw new Error(
			`${VAULT_ENV_VAR} is not set. Point it at your Obsidian test vault (the folder containing .obsidian/), e.g. SPECORATOR_TEST_VAULT=/path/to/vault npm run build:deploy.`,
		);
	}
	if (!(await pathExists(vaultPath))) {
		throw new Error(`Vault path does not exist: ${vaultPath}`);
	}
	const obsidianDir = path.join(vaultPath, '.obsidian');
	if (!(await pathExists(obsidianDir))) {
		throw new Error(
			`Vault path is not an Obsidian vault (missing .obsidian/): ${vaultPath}. ${VAULT_ENV_VAR} must point at the vault root.`,
		);
	}

	const pluginId = await readPluginId(repoRoot);
	const targetDir = resolveTargetDir(vaultPath, pluginId);
	await mkdir(targetDir, { recursive: true });

	const copied = [];
	const missing = [];
	for (const file of PLUGIN_FILES) {
		const src = path.join(repoRoot, file);
		if (!(await pathExists(src))) {
			missing.push(file);
			continue;
		}
		const dest = path.join(targetDir, file);
		await copyFile(src, dest);
		copied.push(file);
		log(`copy: ${file} -> ${dest}`);
	}

	if (copied.length === 0) {
		throw new Error(
			`No build artefacts found in ${repoRoot}. Run \`npm run build\` before deploying.`,
		);
	}
	if (missing.includes('main.js')) {
		throw new Error('main.js missing — run `npm run build` before deploying.');
	}

	return { pluginId, targetDir, copied, missing };
}

function isMain() {
	const entry = process.argv[1];
	if (!entry) return false;
	return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

async function main() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(here, '..');
	const vaultPath = process.env[VAULT_ENV_VAR];
	try {
		const result = await deployToVault({
			repoRoot,
			vaultPath,
			log: (msg) => console.log(msg),
		});
		console.log(`Deployed ${result.copied.length} file(s) to ${result.targetDir}`);
		if (result.missing.length > 0) {
			console.log(`Skipped (not present in build output): ${result.missing.join(', ')}`);
		}
	} catch (err) {
		console.error(`deploy-to-test-vault: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

if (isMain()) {
	await main();
}
