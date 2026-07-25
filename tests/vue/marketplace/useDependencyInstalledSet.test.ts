import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import type { SkillInstallTarget } from '@/features/marketplace/skillInstallTargets';
import { useDependencyInstalledSet } from '@/features/marketplace/vue/useDependencyInstalledSet';

function skill(id: string): MarketplaceItem {
  return { id, type: 'skill', name: id.split('/')[1], description: '', path: `${id}/SKILL.md`, tags: [] };
}

const CLAUDE: SkillInstallTarget = { provider: 'claude', scope: 'project' };
const CODEX: SkillInstallTarget = { provider: 'codex', scope: 'project' };

/** Runs the composable inside a scope so its watcher can be disposed. */
function withScope<T>(fn: () => T): { result: T; stop: () => void } {
  const scope = effectScope();
  const result = scope.run(fn) as T;
  return { result, stop: () => scope.stop() };
}

describe('useDependencyInstalledSet', () => {
  it('resolves each dependency against the selected target', async () => {
    const deps = [skill('skills/a'), skill('skills/b')];
    const { result, stop } = withScope(() =>
      useDependencyInstalledSet(
        () => deps,
        () => CLAUDE,
        () => (item: MarketplaceItem) => Promise.resolve(item.id === 'skills/a'),
        () => 0,
      ),
    );
    await vi.waitFor(() => expect([...result.value]).toEqual(['skills/a']));
    stop();
  });

  it('re-resolves when the target changes', async () => {
    const deps = [skill('skills/a')];
    const target = ref<SkillInstallTarget>(CLAUDE);
    const { result, stop } = withScope(() =>
      useDependencyInstalledSet(
        () => deps,
        () => target.value,
        () => (_item: MarketplaceItem, chosen: SkillInstallTarget) =>
          Promise.resolve(chosen.provider === 'codex'),
        () => 0,
      ),
    );
    await vi.waitFor(() => expect(result.value.size).toBe(0)); // absent under Claude
    target.value = CODEX;
    await vi.waitFor(() => expect([...result.value]).toEqual(['skills/a']));
    stop();
  });

  it('drops a superseded pass, so a slow earlier answer cannot land last', async () => {
    // Switching provider twice quickly leaves two resolves in flight. The first
    // says "installed", the second says "not" — and the FIRST settles last. Only
    // the newer pass may own the result, or the badges would show the stale target.
    const deps = [skill('skills/a')];
    const target = ref<SkillInstallTarget>(CLAUDE);
    let releaseFirst: (value: boolean) => void = () => {};
    const resolver = vi
      .fn<(item: MarketplaceItem, chosen: SkillInstallTarget) => Promise<boolean>>()
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
      .mockImplementation(() => Promise.resolve(false));

    const { result, stop } = withScope(() =>
      useDependencyInstalledSet(() => deps, () => target.value, () => resolver, () => 0),
    );
    await nextTick();
    target.value = CODEX; // starts the second pass while the first is still held
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    releaseFirst(true); // the stale pass now reports "installed"
    await nextTick();
    await nextTick();
    expect([...result.value]).toEqual([]); // the newer pass still owns the answer
    stop();
  });

  it('is empty when there is no target, no resolver, or nothing to resolve', async () => {
    const noTarget = withScope(() =>
      useDependencyInstalledSet(() => [skill('skills/a')], () => null, () => () => Promise.resolve(true), () => 0),
    );
    const noResolver = withScope(() =>
      useDependencyInstalledSet(() => [skill('skills/a')], () => CLAUDE, () => undefined, () => 0),
    );
    const noDeps = withScope(() =>
      useDependencyInstalledSet(() => [], () => CLAUDE, () => () => Promise.resolve(true), () => 0),
    );
    await nextTick();
    expect(noTarget.result.value.size).toBe(0);
    expect(noResolver.result.value.size).toBe(0);
    expect(noDeps.result.value.size).toBe(0);
    [noTarget, noResolver, noDeps].forEach((s) => s.stop());
  });

  it('treats a failed check as not-installed rather than rejecting', async () => {
    // A skill presence probe is filesystem I/O; one failure must not blank or
    // break the whole list.
    const { result, stop } = withScope(() =>
      useDependencyInstalledSet(
        () => [skill('skills/a'), skill('skills/b')],
        () => CLAUDE,
        () => (item: MarketplaceItem) =>
          item.id === 'skills/a' ? Promise.reject(new Error('EIO')) : Promise.resolve(true),
        () => 0,
      ),
    );
    await vi.waitFor(() => expect([...result.value]).toEqual(['skills/b']));
    stop();
  });
});
