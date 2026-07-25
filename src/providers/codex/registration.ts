import type { ProviderRegistration } from '../../core/providers/types';
import { CodexInlineEditService } from './auxiliary/CodexInlineEditService';
import { CodexInstructionRefineService } from './auxiliary/CodexInstructionRefineService';
import { CodexTitleGenerationService } from './auxiliary/CodexTitleGenerationService';
import { CODEX_PROVIDER_CAPABILITIES } from './capabilities';
import { codexSettingsReconciler } from './env/CodexSettingsReconciler';
import { CodexConversationHistoryService } from './history/CodexConversationHistoryService';
import { codexSubagentLifecycleAdapter } from './normalization/codexSubagentNormalization';
import { CODEX_CANONICAL_TOOL_NAMES } from './normalization/codexToolNormalization';
import { CodexChatRuntime } from './runtime/CodexChatRuntime';
import { DEFAULT_CODEX_PROVIDER_SETTINGS, getCodexProviderSettings } from './settings';
import { serializeSubagentToml } from './storage/CodexSubagentStorage';
import { codexChatUIConfig } from './ui/CodexChatUIConfig';

export const codexProviderRegistration: ProviderRegistration = {
  displayName: 'Codex',
  firstRunBlurb: 'OpenAI Codex CLI',
  cliCommand: 'codex',
  cliInstall: {
    docsUrl: 'https://github.com/openai/codex',
    authCommand: 'codex',
    // Spawns its own command, so the shared cmd.exe wrap
    // (`resolveBatchAwareSpawnSpec`) launches a `.cmd`/`.bat` shim.
    launchForms: ['windows-batch'],
    methods: [
      {
        id: 'npm',
        label: 'npm (global)',
        displayCommand: 'npm install -g @openai/codex',
        argv: { command: 'npm', args: ['install', '-g', '@openai/codex'] },
      },
      {
        id: 'native',
        label: 'PowerShell installer',
        displayCommand: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
        argv: null,
        platforms: ['win32'],
      },
      {
        id: 'homebrew',
        label: 'Homebrew',
        displayCommand: 'brew install codex',
        argv: { command: 'brew', args: ['install', 'codex'] },
        platforms: ['darwin'],
      },
    ],
  },
  blankTabOrder: 15,
  isEnabled: (settings) => getCodexProviderSettings(settings).enabled,
  // Run resolution stays default-true: in WSL the app-server runs INSIDE the distro
  // and `skills/list` discovers the distro's own `~/.codex/skills`, so those user-scope
  // skills are runnable — the run path must not refuse them. Only the Marketplace *install*
  // is gated, because a host-side `HomeFileAdapter` writes the Windows `~/.codex`
  // (`\\wsl$\<distro>\...` is the runtime home instead), which the in-distro app-server
  // never sees. Native installs use the host home, where a user install resolves normally.
  installsUserScopeSkills: (settings) => getCodexProviderSettings(settings).installationMethod !== 'wsl',
  defaultConfig: { ...DEFAULT_CODEX_PROVIDER_SETTINGS },
  capabilities: CODEX_PROVIDER_CAPABILITIES,
  canonicalToolNames: CODEX_CANONICAL_TOOL_NAMES,
  environmentKeyPatterns: [/^OPENAI_/i, /^CODEX_/i],
  chatUIConfig: codexChatUIConfig,
  settingsReconciler: codexSettingsReconciler,
  createRuntime: ({ plugin, host }) => new CodexChatRuntime(plugin, host),
  createTitleGenerationService: (plugin) => new CodexTitleGenerationService(plugin),
  createInstructionRefineService: (plugin) => new CodexInstructionRefineService(plugin),
  createInlineEditService: (plugin) => new CodexInlineEditService(plugin),
  historyService: new CodexConversationHistoryService(),
  subagentLifecycleAdapter: codexSubagentLifecycleAdapter,
  projectRosterAgent: (input, slug) => ({
    path: `.codex/agents/${slug}.toml`,
    content: serializeSubagentToml({
      name: input.name,
      description: input.description,
      developerInstructions: input.prompt,
    }),
  }),
};
