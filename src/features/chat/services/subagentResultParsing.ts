/**
 * Pure parsing helpers for subagent / Task tool results: JSON-record coercion,
 * terminal-vs-running status classification, and agent-id extraction. Lifted out
 * of `SubagentManager` so the heuristics are independently testable and the
 * manager stays an orchestrator.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isTerminalTaskStatusValue(rawStatus: unknown): boolean {
  if (typeof rawStatus !== 'string') {
    return false;
  }

  const normalized = rawStatus.toLowerCase();
  return normalized === 'completed' || normalized === 'success' || normalized === 'error';
}

export function hasTerminalTaskStatus(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const rawStatus = value.retrieval_status ?? value.status;
  return isTerminalTaskStatusValue(rawStatus);
}

export function extractAgentIdFromRecord(record: Record<string, unknown>): string | null {
  const direct = record.agent_id ?? record.agentId;
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }

  const data = record.data;
  if (!isRecord(data)) {
    return null;
  }

  const nested = data.agent_id ?? data.agentId;
  return typeof nested === 'string' && nested.length > 0 ? nested : null;
}

export function parsedResultIndicatesRunning(parsed: Record<string, unknown>): boolean {
  const status = parsed.retrieval_status ?? parsed.status;
  if (status === 'not_ready' || status === 'running' || status === 'pending') {
    return true;
  }

  const agents = isRecord(parsed.agents) ? parsed.agents : null;
  if (!agents || Object.keys(agents).length === 0) {
    return false;
  }
  return Object.values(agents)
    .map((agent) => (isRecord(agent) && typeof agent.status === 'string') ? agent.status.toLowerCase() : '')
    .some(s => s === 'running' || s === 'pending' || s === 'not_ready');
}

export function plainPayloadIndicatesRunning(payload: string): boolean {
  const lowerResult = payload.toLowerCase();
  if (lowerResult.includes('not_ready') || lowerResult.includes('not ready')) {
    return true;
  }

  const xmlStatusMatch = lowerResult.match(/<status>([^<]+)<\/status>/);
  if (!xmlStatusMatch) return false;
  const status = xmlStatusMatch[1].trim();
  return status === 'running' || status === 'pending' || status === 'not_ready';
}
