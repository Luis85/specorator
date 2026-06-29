/** Shared record/string coercion used across Codex notification routing. */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}
