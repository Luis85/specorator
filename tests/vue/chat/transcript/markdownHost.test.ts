import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock } from 'vitest';

import MarkdownHost from '@/features/chat/ui/vue/transcript/MarkdownHost.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

// The mock's `MarkdownRenderer.render(app, markdown, el, sourcePath, component)`
// delegates to `MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component)`
// (see tests/__mocks__/obsidian.ts) — the same seam
// tests/unit/features/chat/rendering/MessageRenderer.test.ts overrides to
// simulate real Obsidian rendering. It does NOT touch `el` by default, so
// tests that need visible output install their own implementation.
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function mountHost(markdown: string, deferMath = false) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(MarkdownHost, {
    props: { markdown, deferMath },
    global: {
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
      },
    },
  });
}

beforeEach(() => {
  renderMock.mockReset();
  // Default: mirror a real render by stamping the markdown into the host so
  // assertions can read the DOM instead of only inspecting mock call args.
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('MarkdownHost', () => {
  it('empties the host then renders the given markdown into it', async () => {
    const { container } = mountHost('hello world');
    await flushPromises();

    const rendered = container.querySelectorAll('.specorator-markdown-host .rendered-md');
    expect(rendered).toHaveLength(1);
    expect(rendered[0].textContent).toBe('hello world');
  });

  it('re-renders on a markdown prop change and drops a stale in-flight render (generation token)', async () => {
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    // First call (triggered by mount) hangs on firstGate; every later call
    // (triggered by the prop change) resolves immediately.
    renderMock.mockImplementationOnce(async (md: string, el: HTMLElement) => {
      await firstGate;
      el.createDiv({ cls: 'rendered-md', text: md });
    });

    const { container, rerender } = mountHost('first');

    // Change the prop before the first render lands.
    await rerender({ markdown: 'second', deferMath: false });
    await flushPromises();

    // The newer render (unblocked) has already landed; the older one is still
    // pending behind firstGate.
    let rendered = container.querySelectorAll('.specorator-markdown-host .rendered-md');
    expect(rendered).toHaveLength(1);
    expect(rendered[0].textContent).toBe('second');

    // Release the stale render. It must be discarded, not appended or allowed
    // to clobber the newer content.
    resolveFirst();
    await flushPromises();

    rendered = container.querySelectorAll('.specorator-markdown-host .rendered-md');
    expect(rendered).toHaveLength(1);
    expect(rendered[0].textContent).toBe('second');
  });

  it('owns exactly one host element and never lets Vue diff inside it', () => {
    const { container, unmount } = mountHost('ignored');

    const host = container.querySelector('.specorator-markdown-host');
    expect(host).not.toBeNull();
    // Vue's own template renders a single empty host div synchronously; any
    // content inside is appended imperatively (by renderMarkdownInto's caller),
    // never via v-for/reactive children Vue would diff.
    expect(host?.children.length).toBe(0);
    expect(container.children.length).toBe(1);

    unmount();
  });
});
