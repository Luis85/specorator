export const VAULT_ENV_VAR: 'SPECORATOR_TEST_VAULT';

export interface DeployOptions {
	readonly repoRoot: string;
	readonly vaultPath: string | undefined;
	readonly log?: (message: string) => void;
}

export interface DeployResult {
	readonly pluginId: string;
	readonly targetDir: string;
	readonly copied: ReadonlyArray<string>;
	readonly missing: ReadonlyArray<string>;
}

export function readPluginId(repoRoot: string): Promise<string>;
export function resolveTargetDir(vaultPath: string, pluginId: string): string;
export function deployToVault(options: DeployOptions): Promise<DeployResult>;
