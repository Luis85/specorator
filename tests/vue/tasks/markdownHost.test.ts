import { render } from '@testing-library/vue';
import { Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock } from 'vitest';
import { nextTick } from 'vue';

import MarkdownHost from '@/features/tasks/ui/vue/components/MarkdownHost.vue';
import { DETAIL_APP_KEY, DETAIL_MD_COMPONENT_KEY } from '@/features/tasks/ui/vue/detailKeys';

// The mock MarkdownRenderer.render records (app, markdown, el, sourcePath, component);
// the owned child component is the 5th arg (index 4).
const renderMock = MarkdownRenderer.render as unknown as Mock;
const componentOf = (callIndex: number): Component => renderMock.mock.calls[callIndex][4] as Component;

function mountHost(markdown: string) {
  const parent = new Component();
  const utils = render(MarkdownHost, {
    props: { markdown, sourcePath: 'x.md' },
    global: { provide: { [DETAIL_APP_KEY as symbol]: {}, [DETAIL_MD_COMPONENT_KEY as symbol]: parent } },
  });
  return { parent, ...utils };
}

beforeEach(() => renderMock.mockClear());

describe('MarkdownHost — owned child-component lifecycle', () => {
  it('renders through an OWN child component parented under the injected component', async () => {
    const { parent } = mountHost('hello');
    // The template-ref → watchEffect render lands a tick after render() returns.
    await nextTick();
    expect(renderMock).toHaveBeenCalledTimes(1);
    const child = componentOf(0);
    expect(child).toBeInstanceOf(Component);
    expect(child).not.toBe(parent);
    expect(parent.addChild).toHaveBeenCalledWith(child);
  });

  it('tears down the prior render child on a content change (fresh child per render)', async () => {
    const { parent, rerender } = mountHost('a');
    await nextTick();
    const first = componentOf(0);
    await rerender({ markdown: 'b', sourcePath: 'x.md' });
    await nextTick();
    expect(renderMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const second = componentOf(renderMock.mock.calls.length - 1);
    // A fresh child per render, and the prior one detached from the parent BEFORE
    // the new render (so its registered children can't accumulate).
    expect(second).not.toBe(first);
    expect(parent.removeChild).toHaveBeenCalledWith(first);
  });

  it('detaches its child from the parent on unmount', async () => {
    const { parent, unmount } = mountHost('hello');
    await nextTick();
    const child = componentOf(0);
    unmount();
    expect(parent.removeChild).toHaveBeenCalledWith(child);
  });
});
