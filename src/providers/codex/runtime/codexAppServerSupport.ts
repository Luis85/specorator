import { buildFullSubprocessEnvironment } from '../../../core/providers/subprocessEnvironmentAllowlist';
import type { ProviderId } from '../../../core/providers/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { getEnhancedPath } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import type { InitializeResult } from './codexAppServerTypes';
import { buildCodexLaunchSpec } from './CodexLaunchSpecBuilder';
import type { CodexLaunchSpec } from './codexLaunchTypes';
import type { CodexRpcTransport } from './CodexRpcTransport';

const CODEX_APP_SERVER_CLIENT_INFO = Object.freeze({
  name: 'specorator',
  version: '1.0.0',
});

export function getCodexAppServerWorkingDirectory(plugin: PluginContext): string {
  return getVaultPath(plugin.app) ?? process.cwd();
}

export function buildCodexAppServerEnvironment(
  plugin: PluginContext,
  providerId: ProviderId = 'codex',
): Record<string, string> {
  const customEnv = plugin.getResolvedEnvironmentVariables(providerId);
  // Full host-env passthrough (Claude-parity) so the child and its shell tools
  // resolve host binaries; only the TLS-bypass kill-switch is filtered.
  return buildFullSubprocessEnvironment({
    processEnv: process.env,
    customEnv,
    pathOverride: getEnhancedPath(customEnv.PATH),
  });
}

export function resolveCodexAppServerLaunchSpec(
  plugin: PluginContext,
  providerId: ProviderId = 'codex',
): CodexLaunchSpec {
  return buildCodexLaunchSpec({
    settings: plugin.settings,
    resolvedCliCommand: plugin.getResolvedProviderCliPath(providerId),
    hostVaultPath: getCodexAppServerWorkingDirectory(plugin),
    env: buildCodexAppServerEnvironment(plugin, providerId),
  });
}

export async function initializeCodexAppServerTransport(
  transport: CodexRpcTransport,
): Promise<InitializeResult> {
  const result = await transport.request<InitializeResult>('initialize', {
    clientInfo: CODEX_APP_SERVER_CLIENT_INFO,
    capabilities: { experimentalApi: true },
  });

  transport.notify('initialized');
  return result;
}
