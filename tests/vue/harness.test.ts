import { fireEvent, render, screen } from '@testing-library/vue';
import { setIcon } from 'obsidian';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';

import HarnessProbe from './fixtures/HarnessProbe.vue';

const useProbeStore = defineStore('harness-probe', () => {
  const n = ref(0);
  const doubled = computed(() => n.value * 2);
  function bump(): void {
    n.value += 1;
  }
  return { n, doubled, bump };
});

describe('vue test harness', () => {
  it('compiles and renders an SFC with reactive updates', async () => {
    render(HarnessProbe, { props: { label: 'probe' } });
    expect(screen.getByText('probe')).toBeTruthy();
    const btn = screen.getByRole('button');
    await fireEvent.click(btn);
    expect(btn.textContent).toContain('1 / 2');
  });

  it('supports pinia setup stores via setActivePinia', () => {
    setActivePinia(createPinia());
    const store = useProbeStore();
    store.bump();
    expect(store.n).toBe(1);
    expect(store.doubled).toBe(2);
  });

  it('serves the shared obsidian fake through the alias + jest-global shim', () => {
    expect(vi.isMockFunction(setIcon)).toBe(true);
  });
});
