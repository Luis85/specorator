import { mount } from '@vue/test-utils';
import type { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

vi.mock('@/utils/fileLink', () => ({
  resolveOpenableVaultPath: vi.fn(),
}));

import { APP_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import { useFileLink } from '@/features/chat/ui/vue/transcript/useFileLink';
import { resolveOpenableVaultPath } from '@/utils/fileLink';

const resolveMock = vi.mocked(resolveOpenableVaultPath);
const mockApp = {} as App;

/** Mounts a host component so `useFileLink`'s `inject()` calls resolve against real provides. */
function mountUseFileLink(provide: Record<symbol, unknown> = {}) {
  let result!: ReturnType<typeof useFileLink>;
  const Comp = defineComponent({
    setup() {
      result = useFileLink();
      return () => h('div');
    },
  });
  const wrapper = mount(Comp, { global: { provide } });
  return { wrapper, get: () => result };
}

describe('useFileLink', () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  describe('resolve', () => {
    it('returns null and never calls the resolver when no App is injected', () => {
      resolveMock.mockReturnValue('unexpected');
      const { get } = mountUseFileLink();

      expect(get().resolve('/vault/a.md')).toBeNull();
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it('returns null and never calls the resolver for a falsy path', () => {
      const { get } = mountUseFileLink({ [APP_KEY as symbol]: mockApp });

      expect(get().resolve('')).toBeNull();
      expect(get().resolve(null)).toBeNull();
      expect(get().resolve(undefined)).toBeNull();
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it('delegates to resolveOpenableVaultPath with the injected App when both are present', () => {
      resolveMock.mockImplementation((_app, rawPath) => (rawPath === '/vault/a.md' ? 'a.md' : null));
      const { get } = mountUseFileLink({ [APP_KEY as symbol]: mockApp });

      expect(get().resolve('/vault/a.md')).toBe('a.md');
      expect(resolveMock).toHaveBeenCalledWith(mockApp, '/vault/a.md');
      expect(get().resolve('/outside/b.md')).toBeNull();
    });
  });
});
