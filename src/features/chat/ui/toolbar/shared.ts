import type {
  ProviderCapabilities,
  ProviderChatUIConfig,
} from '../../../../core/providers/types';

// Single import surface for the two retained toolbar engine objects (their own
// DOM-render layer was stripped in the Phase 2 cutover). The old InputToolbar
// barrel that used to consolidate these was deleted with the imperative widgets.
export { type AddExternalContextResult, ExternalContextSelector } from './ExternalContextSelector';
export { McpServerSelector } from './McpServerSelector';

export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0';
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

export interface ToolbarSettings {
  model: string;
  thinkingBudget: string;
  effortLevel: string;
  serviceTier: string;
  permissionMode: string;
  [key: string]: unknown;
}

export interface ToolbarCallbacks {
  onModelChange: (model: string) => Promise<void>;
  onModeChange: (mode: string) => Promise<void>;
  onThinkingBudgetChange: (budget: string) => Promise<void>;
  onEffortLevelChange: (effort: string) => Promise<void>;
  onServiceTierChange: (serviceTier: string) => Promise<void>;
  onPermissionModeChange: (mode: string) => Promise<void>;
  /** Toggles plan mode on/off (saves/restores pre-plan permission mode). */
  onPlanModeToggle?: () => Promise<void>;
  getSettings: () => ToolbarSettings;
  getEnvironmentVariables?: () => string;
  getUIConfig: () => ProviderChatUIConfig;
  getCapabilities: () => ProviderCapabilities;
}
