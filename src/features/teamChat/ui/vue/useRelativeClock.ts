import { onScopeDispose, readonly, type Ref, ref } from 'vue';

/**
 * A shared, ref-counted clock for the roster's relative timestamps.
 *
 * `Date.now()` read inside a computed is NOT reactive, so without this a row rendered as
 * `now` stays `now` for hours unless some unrelated snapshot happens to re-render it — the
 * minute/hour/day labels would simply never advance.
 *
 * One module-level interval serves every mounted row (a 40-agent roster must not arm 40
 * timers), ticking at the resolution of the smallest bucket the labels distinguish. It
 * starts on the first subscriber and is cleared on the last, so a closed Team Chat leaf
 * leaves no timer running.
 */
const TICK_MS = 30_000;

const now = ref(Date.now());
let timer: number | null = null;
let subscribers = 0;

function start(): void {
  if (timer !== null) return;
  // window.* (not the bare globals) so a popout leaf's timers belong to its own window.
  timer = window.setInterval(() => { now.value = Date.now(); }, TICK_MS);
}

function stop(): void {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
}

/**
 * Subscribes the calling component scope to the shared clock and returns the current time
 * as a reactive ref. Auto-unsubscribes on scope disposal (`onScopeDispose`, so it works in
 * a composable as well as a component).
 *
 * The returned ref is readonly: a consumer that could write it would desynchronize every
 * other row from the real clock.
 */
export function useRelativeClock(): Readonly<Ref<number>> {
  subscribers += 1;
  // Re-stamp on subscribe so a row mounting between ticks renders against the real time
  // rather than up to TICK_MS of staleness inherited from the last tick.
  now.value = Date.now();
  start();
  onScopeDispose(() => {
    subscribers -= 1;
    if (subscribers <= 0) {
      subscribers = 0;
      stop();
    }
  });
  return readonly(now);
}
