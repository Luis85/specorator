import { buildUsageInfo } from '../../core/providers/usage';
import type { UsageInfo } from '../../core/types';
import type { AcpUsage, AcpUsageUpdate } from './types';

export interface BuildAcpUsageInfoParams {
  contextWindow?: AcpUsageUpdate | null;
  model: string;
  promptUsage?: AcpUsage | null;
  // Non-authoritative context-window size (e.g. the model catalog) used when no
  // `usage_update` carried an authoritative window. Lets a prompt-usage-only turn
  // keep the window/percentage instead of collapsing to 0. Never marks the result
  // authoritative (that stays gated on a real `contextWindow`).
  fallbackContextWindowSize?: number;
}

export function buildAcpUsageInfo(params: BuildAcpUsageInfoParams): UsageInfo | null {
  const promptUsage = params.promptUsage ?? null;
  const contextWindow = params.contextWindow ?? null;

  if (!promptUsage && !contextWindow) {
    return null;
  }

  const contextTokens = contextWindow?.used ?? promptUsage?.totalTokens ?? 0;
  const contextWindowSize = contextWindow?.size ?? params.fallbackContextWindowSize ?? 0;
  const cost = contextWindow?.cost;
  const costUsd = cost && cost.currency === 'USD' && Number.isFinite(cost.amount) ? cost.amount : undefined;

  // Pass through only the AcpUsage fields that were actually defined. `numberOrUndefined`
  // yields `undefined` (not 0) for missing optional fields so the shared builder omits them
  // entirely from the persisted UsageInfo (avoiding phantom zeros).
  return buildUsageInfo({
    model: params.model,
    inputTokens: promptUsage?.inputTokens ?? 0,
    outputTokens: numberOrUndefined(promptUsage?.outputTokens),
    thoughtTokens: numberOrUndefined(promptUsage?.thoughtTokens),
    cacheCreationInputTokens: numberOrUndefined(promptUsage?.cachedWriteTokens),
    cacheReadInputTokens: numberOrUndefined(promptUsage?.cachedReadTokens),
    contextTokens,
    contextWindow: contextWindowSize,
    contextWindowIsAuthoritative: Boolean(contextWindow),
    costUsd,
  });
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
