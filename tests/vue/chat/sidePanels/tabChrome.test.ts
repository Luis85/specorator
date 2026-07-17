import { describe, expect, it } from 'vitest';

import { BashOutputStore } from '@/features/chat/state/BashOutputStore';
import { TabChromeProjection } from '@/features/chat/tabs/tabChrome';
import type { TabData } from '@/features/chat/tabs/types';
import type { TabChromeSnapshot } from '@/features/chat/ui/vue/tabChrome/tabChromeCallbacks';

function makeTab(): TabData {
  const bashOutputs = new BashOutputStore(() => {});
  return { state: { currentTodos: null }, bashOutputs } as unknown as TabData;
}

describe('TabChromeProjection', () => {
  it('pushes the current snapshot immediately on subscribe', () => {
    const tab = makeTab();
    const proj = new TabChromeProjection(tab);
    const seen: TabChromeSnapshot[] = [];
    proj.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(1);
    expect(seen[0].todos).toBeNull();
    expect(seen[0].bashOutputs).toEqual([]);
  });

  it('re-projects todos + bash on emit', () => {
    const tab = makeTab();
    const proj = new TabChromeProjection(tab);
    let last: TabChromeSnapshot | null = null;
    proj.subscribe((s) => (last = s));
    (tab.state as never as { currentTodos: unknown }).currentTodos = [{ content: 'x', status: 'pending', activeForm: 'X' }];
    tab.bashOutputs!.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    proj.emit();
    expect(last!.todos).toHaveLength(1);
    expect(last!.bashOutputs).toHaveLength(1);
  });
});
