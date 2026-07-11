import { t } from '../../../i18n/i18n';
import type { TaskSpec } from '../model/taskTypes';

export interface LiveStripPatch {
  lastLedger: string | undefined;
  elapsedMs: number;
  attemptNumber: number;
  heartbeatAgeMs: number;
}

export type StaleTier = 'green' | 'amber' | 'red';

/** Heartbeat-age freshness tier: green < 60s ≤ amber < 300s ≤ red. */
export function staleTier(ageMs: number): StaleTier {
  if (ageMs < 60_000) return 'green';
  if (ageMs < 300_000) return 'amber';
  return 'red';
}

/**
 * Freshness glyph for the live-strip dot: the bullet is the basic "live"
 * indicator, escalating to a half / empty glyph for the amber / red tiers so
 * the signal survives without color (a non-color cue for color-blind users).
 */
export function staleGlyph(tier: StaleTier): string {
  return tier === 'green' ? '●' : tier === 'amber' ? '◐' : '◯';
}

/** Elapsed run time as `Nm Ss` — the live-strip caption's leading token. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/** Coarse heartbeat age (`Ns` / `Nm` / `Nh`) used only in the strip dot's aria label. */
function formatStaleAge(ageMs: number): string {
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  return `${Math.round(ageMs / 3_600_000)}h`;
}

/** Per-tier accessible name for the live-strip freshness dot. */
export function staleAriaLabel(tier: StaleTier, ageMs: number): string {
  const age = formatStaleAge(ageMs);
  if (tier === 'green') return t('tasks.board.card.liveStrip.heartbeatFresh', { age });
  if (tier === 'amber') return t('tasks.board.card.liveStrip.heartbeatStale', { age });
  return t('tasks.board.card.liveStrip.heartbeatVeryStale', { age });
}

function lastLedgerLine(ledger: string): string | undefined {
  return ledger.split('\n').filter((line) => line.trim().length > 0).pop();
}

/**
 * Pure live-strip projection shared by the imperative tracker and the Vue
 * `LiveStrip` component. The caller resolves the heartbeat source (the live
 * overlay tick when it holds one, else the work order's `frontmatter.heartbeat`)
 * and the live ledger override; both fall back internally — an absent heartbeat
 * reads as `now` (age 0) and an absent ledger reads the last non-blank line of
 * the ledger section. Kept side-effect free so the Vue strip can call it in a
 * per-task watch without touching the DOM.
 */
export function computeLiveStrip(
  task: TaskSpec,
  heartbeatSource: string | null | undefined,
  ledgerMsg: string | undefined,
  now: number,
): LiveStripPatch {
  const startedAt = task.frontmatter.started ? Date.parse(task.frontmatter.started) : now;
  const heartbeatAt = heartbeatSource ? Date.parse(heartbeatSource) : now;
  return {
    lastLedger: ledgerMsg ?? lastLedgerLine(task.sections.ledger),
    elapsedMs: Math.max(0, now - startedAt),
    attemptNumber: task.frontmatter.attempts,
    heartbeatAgeMs: Math.max(0, now - heartbeatAt),
  };
}
