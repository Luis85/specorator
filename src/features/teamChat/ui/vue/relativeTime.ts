import { t } from '../../../../i18n/i18n';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past a week, a "9d" style label stops helping — switch to a real date. */
const RELATIVE_LIMIT_MS = 7 * DAY_MS;

/**
 * Coarse relative label for a roster row's last DM activity (`now` / `12m` / `3h` / `2d`,
 * then a locale date). Deliberately low-resolution: the row is 4rem wide and the exact
 * time already rides the `title`/`datetime` attributes, so precision here would only cost
 * horizontal space and force re-renders on every tick.
 *
 * `now` covers everything under a minute INCLUDING future timestamps — a clock skew
 * between devices (Obsidian Sync) must read as "just now", never as a negative age.
 */
export function formatRelativeActivity(timestamp: number, now: number = Date.now()): string {
  if (!timestamp) return '';
  const elapsed = now - timestamp;
  if (elapsed < MINUTE_MS) return t('teamChat.timeNow');
  if (elapsed < HOUR_MS) return t('teamChat.timeMinutes', { count: Math.floor(elapsed / MINUTE_MS) });
  if (elapsed < DAY_MS) return t('teamChat.timeHours', { count: Math.floor(elapsed / HOUR_MS) });
  if (elapsed < RELATIVE_LIMIT_MS) return t('teamChat.timeDays', { count: Math.floor(elapsed / DAY_MS) });
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Absolute time for the row's `title` + `<time datetime>`, so the coarse label above
 *  stays hoverable-precise and machine-readable. */
export function formatAbsoluteActivity(timestamp: number): string {
  return timestamp ? new Date(timestamp).toLocaleString() : '';
}

/** ISO string for `<time datetime>`; empty for an absent timestamp so the attribute
 *  can be omitted rather than emitted invalid. */
export function toIsoTimestamp(timestamp: number): string {
  return timestamp ? new Date(timestamp).toISOString() : '';
}
