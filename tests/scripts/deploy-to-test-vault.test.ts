import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	deployToVault,
	readPluginId,
	resolveTargetDir,
	VAULT_ENV_VAR,
} from '../../scripts/deploy-to-test-vault.mjs';

async function makeTempDir(prefix: string): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), prefix));
}

async function writeFakeRepo(repoRoot: string, files: Record<string, string>): Promise<void> {
	await writeFile(
		path.join(repoRoot, 'manifest.json'),
		JSON.stringify({ id: 'specorator', name: 'Specorator', version: '0.0.1' }),
		'utf8',
	);
	for (const [name, contents] of Object.entries(files)) {
		await writeFile(path.join(repoRoot, name), contents, 'utf8');
	}
}

async function writeFakeVault(vaultRoot: string): Promise<void> {
	await mkdir(path.join(vaultRoot, '.obsidian'), { recursive: true });
}

describe('deploy-to-test-vault — env var contract', () => {
	it('exports the canonical env var name', () => {
		expect(VAULT_ENV_VAR).toBe('SPECORATOR_TEST_VAULT');
	});

	it('throws a helpful error when vaultPath is missing', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFakeRepo(repoRoot, {});
			await expect(deployToVault({ repoRoot, vaultPath: undefined })).rejects.toThrow(
				/SPECORATOR_TEST_VAULT is not set/,
			);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});
});

describe('deploy-to-test-vault — vault validation', () => {
	it('rejects a vault path that does not exist', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFakeRepo(repoRoot, {});
			await expect(
				deployToVault({ repoRoot, vaultPath: path.join(repoRoot, 'nope') }),
			).rejects.toThrow(/Vault path does not exist/);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it('rejects a folder that is not an Obsidian vault', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		const vaultRoot = await makeTempDir('specorator-deploy-vault-');
		try {
			await writeFakeRepo(repoRoot, {});
			await expect(deployToVault({ repoRoot, vaultPath: vaultRoot })).rejects.toThrow(
				/missing \.obsidian/,
			);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
			await rm(vaultRoot, { recursive: true, force: true });
		}
	});
});

describe('deploy-to-test-vault — manifest plumbing', () => {
	it('reads the plugin id from manifest.json', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFakeRepo(repoRoot, {});
			await expect(readPluginId(repoRoot)).resolves.toBe('specorator');
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it('resolves the canonical plugin folder under the vault', () => {
		const target = resolveTargetDir('/vaults/work', 'specorator');
		expect(target.replace(/\\/g, '/')).toBe('/vaults/work/.obsidian/plugins/specorator');
	});
});

describe('deploy-to-test-vault — manifest error cases', () => {
	it('throws when manifest id is an empty string', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFile(
				path.join(repoRoot, 'manifest.json'),
				JSON.stringify({ id: '', name: 'Test', version: '0.0.1' }),
				'utf8',
			);
			await expect(readPluginId(repoRoot)).rejects.toThrow(/missing required string "id"/);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it('throws when manifest id is not a string', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFile(
				path.join(repoRoot, 'manifest.json'),
				JSON.stringify({ id: 42, name: 'Test', version: '0.0.1' }),
				'utf8',
			);
			await expect(readPluginId(repoRoot)).rejects.toThrow(/missing required string "id"/);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it('throws when manifest.json contains invalid JSON', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFile(path.join(repoRoot, 'manifest.json'), '{ broken json', 'utf8');
			await expect(readPluginId(repoRoot)).rejects.toThrow();
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});
});

describe('deploy-to-test-vault — copy behavior', () => {
	it('copies main.js, manifest.json, and styles.css when present', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		const vaultRoot = await makeTempDir('specorator-deploy-vault-');
		try {
			await writeFakeRepo(repoRoot, {
				'main.js': 'console.log("plugin")',
				'styles.css': '.specorator { color: red; }',
			});
			await writeFakeVault(vaultRoot);

			const result = await deployToVault({ repoRoot, vaultPath: vaultRoot });

			expect(result.pluginId).toBe('specorator');
			expect([...result.copied].sort()).toEqual(['main.js', 'manifest.json', 'styles.css']);
			const targetDir = resolveTargetDir(vaultRoot, 'specorator');
			expect(await readFile(path.join(targetDir, 'main.js'), 'utf8')).toBe('console.log("plugin")');
			expect(await readFile(path.join(targetDir, 'styles.css'), 'utf8')).toBe(
				'.specorator { color: red; }',
			);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
			await rm(vaultRoot, { recursive: true, force: true });
		}
	});

	it('reports missing optional files but still succeeds when main.js is present', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		const vaultRoot = await makeTempDir('specorator-deploy-vault-');
		try {
			await writeFakeRepo(repoRoot, {
				'main.js': 'console.log("plugin")',
			});
			await writeFakeVault(vaultRoot);

			const result = await deployToVault({ repoRoot, vaultPath: vaultRoot });

			expect([...result.copied].sort()).toEqual(['main.js', 'manifest.json']);
			expect(result.missing).toContain('styles.css');
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
			await rm(vaultRoot, { recursive: true, force: true });
		}
	});

	it('throws when main.js is absent (build not yet run)', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		const vaultRoot = await makeTempDir('specorator-deploy-vault-');
		try {
			await writeFakeRepo(repoRoot, {});
			await writeFakeVault(vaultRoot);

			await expect(deployToVault({ repoRoot, vaultPath: vaultRoot })).rejects.toThrow(
				/main\.js missing/,
			);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
			await rm(vaultRoot, { recursive: true, force: true });
		}
	});

	it('overwrites previously deployed files (idempotent)', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		const vaultRoot = await makeTempDir('specorator-deploy-vault-');
		try {
			await writeFakeRepo(repoRoot, { 'main.js': 'V1' });
			await writeFakeVault(vaultRoot);
			await deployToVault({ repoRoot, vaultPath: vaultRoot });

			await writeFile(path.join(repoRoot, 'main.js'), 'V2', 'utf8');
			const second = await deployToVault({ repoRoot, vaultPath: vaultRoot });

			expect([...second.copied]).toContain('main.js');
			const targetDir = resolveTargetDir(vaultRoot, 'specorator');
			expect(await readFile(path.join(targetDir, 'main.js'), 'utf8')).toBe('V2');
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
			await rm(vaultRoot, { recursive: true, force: true });
		}
	});
});
