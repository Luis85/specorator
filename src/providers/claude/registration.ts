import type { ProviderRegistration } from '../../core/providers/types';
import { serializeAgent } from '../../utils/agent';
import { getClaudeWorkspaceServices } from './app/claudeWorkspaceAccess';
import { InlineEditService as ClaudeInlineEditService } from './auxiliary/ClaudeInlineEditService';
import { InstructionRefineService as ClaudeInstructionRefineService } from './auxiliary/ClaudeInstructionRefineService';
import { TitleGenerationService as ClaudeTitleGenerationService } from './auxiliary/ClaudeTitleGenerationService';
import { CLAUDE_CANONICAL_TOOL_NAMES } from './canonicalTools';
import { CLAUDE_PROVIDER_CAPABILITIES } from './capabilities';
import { claudeSettingsReconciler } from './env/ClaudeSettingsReconciler';
import { ClaudeConversationHistoryService } from './history/ClaudeConversationHistoryService';
import { ClaudeChatRuntime } from './runtime/ClaudeChatRuntime';
import { ClaudeTaskResultInterpreter } from './runtime/ClaudeTaskResultInterpreter';
import { DEFAULT_CLAUDE_PROVIDER_SETTINGS, getClaudeProviderSettings } from './settings';
import { claudeChatUIConfig } from './ui/ClaudeChatUIConfig';

export const claudeProviderRegistration: ProviderRegistration = {
  displayName: 'Claude',
  firstRunBlurb: 'Anthropic Claude Code',
  cliCommand: 'claude',
  cliInstall: {
    docsUrl: 'https://code.claude.com/docs/en/quickstart',
    authCommand: 'claude',
    // `createCustomSpawnFunction` prefixes a Node entry point with the Node
    // executable, so those launch; a `.cmd` does NOT, because the SDK owns the
    // stdio stream and cmd.exe cannot sit in front of it — the same reason
    // `findClaudeCLIPath` skips `.cmd` while probing and prefers `claude.exe`.
    windowsLaunchForms: ['node'],
    methods: [
      {
        id: 'npm',
        label: 'npm (global)',
        displayCommand: 'npm install -g @anthropic-ai/claude-code',
        argv: { command: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
        // NOT offered on Windows: npm's global bin holds `claude.cmd` plus an
        // extensionless POSIX sh shim, and this provider can launch neither —
        // so a "successful" install would be followed by a card that still says
        // unusable. The native installer below is the Windows route; it lands a
        // real `claude.exe`, which is what `findClaudeCLIPath` probes for first.
        platforms: ['darwin', 'linux'],
      },
      // Piped installer scripts need a shell, so they stay copy-only (argv: null).
      {
        id: 'native',
        label: 'Native installer',
        displayCommand: 'irm https://claude.ai/install.ps1 | iex',
        argv: null,
        platforms: ['win32'],
      },
      {
        id: 'native',
        label: 'Native installer',
        displayCommand: 'curl -fsSL https://claude.ai/install.sh | bash',
        argv: null,
        platforms: ['darwin', 'linux'],
      },
    ],
  },
  blankTabOrder: 20,
  isEnabled: (settings) => getClaudeProviderSettings(settings).enabled,
  // The SDK loads `~/.claude/skills` only when the `user` setting source is on,
  // so a global skill's `/name` can't resolve while `loadUserSettings` is off.
  resolvesUserScopeSkills: (settings) => getClaudeProviderSettings(settings).loadUserSettings,
  defaultConfig: { ...DEFAULT_CLAUDE_PROVIDER_SETTINGS },
  capabilities: CLAUDE_PROVIDER_CAPABILITIES,
  canonicalToolNames: CLAUDE_CANONICAL_TOOL_NAMES,
  environmentKeyPatterns: [/^ANTHROPIC_/i, /^CLAUDE_/i],
  chatUIConfig: claudeChatUIConfig,
  settingsReconciler: claudeSettingsReconciler,
  createRuntime: ({ plugin, host }) => {
    const workspace = getClaudeWorkspaceServices();
    const resolvedMcpManager = workspace?.mcpManager;
    if (!resolvedMcpManager) {
      throw new Error('Claude workspace services are not initialized.');
    }

    return new ClaudeChatRuntime(plugin, {
      mcpManager: resolvedMcpManager,
      pluginManager: workspace?.pluginManager,
      agentManager: workspace?.agentManager,
    }, host);
  },
  createTitleGenerationService: (plugin) => new ClaudeTitleGenerationService(plugin),
  createInstructionRefineService: (plugin) => new ClaudeInstructionRefineService(plugin),
  createInlineEditService: (plugin) => new ClaudeInlineEditService(plugin),
  historyService: new ClaudeConversationHistoryService(),
  taskResultInterpreter: new ClaudeTaskResultInterpreter(),
  projectRosterAgent: (input, slug) => ({
    path: `.claude/agents/${slug}.md`,
    content: serializeAgent({
      id: `roster-${slug}`,
      name: input.name,
      description: input.description,
      prompt: input.prompt,
      skills: input.skills && input.skills.length > 0 ? input.skills : undefined,
      source: 'vault',
    }),
  }),
};
