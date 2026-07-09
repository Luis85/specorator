import { type Ref,ref } from 'vue';

/**
 * Shared request-token guard for the Library stores' `load()`. Every store's
 * reload runs the same dance: a slow load that STARTED before a mutation must
 * not resolve AFTER the mutation's reload and overwrite fresher data (two
 * leaves open, or the mount load overlapping a save/clone/remove). This owns
 * the monotonic token + the `loading` flag so each store's `load()` stays a
 * thin fetch + commit.
 *
 * `commit` runs only while the token is still current, so a stale read can't
 * desync a store's derived lookups from its rows. `loading` clears in the
 * `finally` ONLY for the current token — a superseded load must not clear the
 * flag out from under the newer one still in flight. `onError` is optional:
 * stores that capture an error message (quickAction/roster) pass one and the
 * error is swallowed (current token only); stores without one let the fetch
 * rejection propagate through `load()` as before.
 */
export interface GuardedLoad {
  readonly loading: Ref<boolean>;
  // Property (not method) signature so destructuring `run` off the store's
  // guard doesn't trip @typescript-eslint/unbound-method — `run` closes over
  // its own token/loading and never reads `this`.
  readonly run: <T>(
    fetch: () => Promise<T>,
    commit: (data: T) => void,
    onError?: (error: unknown) => void,
  ) => Promise<void>;
}

export function useGuardedLoad(): GuardedLoad {
  const loading = ref(false);
  let loadToken = 0;

  async function run<T>(
    fetch: () => Promise<T>,
    commit: (data: T) => void,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    const token = ++loadToken;
    loading.value = true;
    try {
      const data = await fetch();
      if (token !== loadToken) return; // superseded by a newer load — drop stale result
      commit(data);
    } catch (error) {
      if (!onError) throw error;
      if (token === loadToken) onError(error);
    } finally {
      if (token === loadToken) loading.value = false;
    }
  }

  return { loading, run };
}
