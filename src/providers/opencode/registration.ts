import type { ProviderRegistration } from '../../core/providers/types';
import { OpencodeInlineEditService } from './auxiliary/OpencodeInlineEditService';
import { OpencodeInstructionRefineService } from './auxiliary/OpencodeInstructionRefineService';
import { OpencodeTitleGenerationService } from './auxiliary/OpencodeTitleGenerationService';
import { OPENCODE_PROVIDER_CAPABILITIES } from './capabilities';
import { clearOpencodeDiscoveryState } from './discoveryState';
import { opencodeSettingsReconciler } from './env/OpencodeSettingsReconciler';
import { OpencodeConversationHistoryService } from './history/OpencodeConversationHistoryService';
import { OPENCODE_CANONICAL_TOOL_NAMES } from './normalization/opencodeToolNormalization';
import { OpencodeChatRuntime } from './runtime/OpencodeChatRuntime';
import { DEFAULT_OPENCODE_PROVIDER_SETTINGS, getOpencodeProviderSettings } from './settings';
import { serializeOpencodeAgentMarkdown } from './storage/OpencodeAgentStorage';
import { opencodeChatUIConfig } from './ui/OpencodeChatUIConfig';

export const opencodeProviderRegistration: ProviderRegistration = {
  blankTabOrder: 10,
  canonicalToolNames: OPENCODE_CANONICAL_TOOL_NAMES,
  defaultConfig: { ...DEFAULT_OPENCODE_PROVIDER_SETTINGS },
  capabilities: OPENCODE_PROVIDER_CAPABILITIES,
  chatUIConfig: opencodeChatUIConfig,
  createInlineEditService: (plugin) => new OpencodeInlineEditService(plugin),
  createInstructionRefineService: (plugin) => new OpencodeInstructionRefineService(plugin),
  createRuntime: ({ plugin, host }) => new OpencodeChatRuntime(plugin, host),
  createTitleGenerationService: (plugin) => new OpencodeTitleGenerationService(plugin),
  displayName: 'OpenCode',
  firstRunBlurb: 'Opencode CLI server',
  cliCommand: 'opencode',
  cliInstall: {
    docsUrl: 'https://opencode.ai/docs/',
    authCommand: 'opencode auth login',
    // Spawns its own command, so the shared cmd.exe wrap
    // (`resolveBatchAwareSpawnSpec`) launches a `.cmd`/`.bat` shim.
    launchForms: ['windows-batch'],
    // `OpencodeChatRuntime` spawns `getResolvedProviderCliPath('opencode') ?? 'opencode'`
    // and `resolveOpencodeCliPath` intentionally checks configured paths only,
    // so a PATH install resolves at spawn time with no path setting at all.
    runtimeFallsBackToPathLookup: true,
    methods: [
      {
        id: 'npm',
        label: 'npm (global)',
        displayCommand: 'npm install -g opencode-ai',
        argv: { command: 'npm', args: ['install', '-g', 'opencode-ai'] },
      },
      {
        id: 'native',
        label: 'Install script',
        displayCommand: 'curl -fsSL https://opencode.ai/install | bash',
        argv: null,
        platforms: ['darwin', 'linux'],
      },
      {
        id: 'scoop',
        label: 'Scoop',
        displayCommand: 'scoop install opencode',
        argv: { command: 'scoop', args: ['install', 'opencode'] },
        platforms: ['win32'],
      },
    ],
  },
  environmentKeyPatterns: [/^OPENCODE_/i],
  // A different binary may not support the models/modes discovered from the old
  // one, so drop the catalog whenever the CLI path changes — the same cleanup
  // `mountOpencodeCliPathSetting` performs before its save.
  onCliPathChanged: (settings) => clearOpencodeDiscoveryState(settings),
  historyService: new OpencodeConversationHistoryService(),
  isEnabled: (settings) => getOpencodeProviderSettings(settings).enabled,
  settingsReconciler: opencodeSettingsReconciler,
  projectRosterAgent: (input, slug) => ({
    path: `.opencode/agent/${slug}.md`,
    // `mode: subagent` is what makes Opencode treat it as @-mentionable.
    content: serializeOpencodeAgentMarkdown({
      name: input.name,
      description: input.description,
      prompt: input.prompt,
      mode: 'subagent',
      color: input.color,
    }),
  }),
};
