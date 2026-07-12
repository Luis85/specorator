import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock } from 'vitest';

import PlanContentPreview from '@/features/chat/ui/vue/transcript/inline/PlanContentPreview.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Parity twin of the `PlanContentPreview` portion of
 * `inlinePlanCards.characterization.test.ts`: reproduces
 * `rendering/planContentPreview.ts`'s `renderPlanContentPreview` DOM
 * contract via `MarkdownHost.vue` for the content path.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function mountPreview(props: { content: string | null; errorMessage: string | null }) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(PlanContentPreview, {
    props,
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
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('PlanContentPreview', () => {
  it('renders markdown content via MarkdownHost inside .specorator-plan-content-preview', async () => {
    const { container } = mountPreview({ content: 'Step 1\nStep 2', errorMessage: null });
    await flushPromises();

    const preview = container.querySelector('.specorator-plan-content-preview')!;
    expect(preview).toBeTruthy();
    expect(preview.classList.contains('specorator-plan-read-error')).toBe(false);
    expect(preview.querySelector('.rendered-md')?.textContent).toBe('Step 1\nStep 2');
  });

  it('renders the read-error block when content is absent but an error message is present', () => {
    const { container } = mountPreview({ content: null, errorMessage: 'boom' });

    const preview = container.querySelector('.specorator-plan-content-preview')!;
    expect(preview).toBeTruthy();
    expect(preview.classList.contains('specorator-plan-read-error')).toBe(true);
    expect(preview.textContent).toBe('boom');
  });

  it('renders nothing when both content and errorMessage are absent', () => {
    const { container } = mountPreview({ content: null, errorMessage: null });
    expect(container.querySelector('.specorator-plan-content-preview')).toBeNull();
  });

  it('prefers content over errorMessage when both are present', async () => {
    const { container } = mountPreview({ content: 'has content', errorMessage: 'ignored' });
    await flushPromises();

    const preview = container.querySelector('.specorator-plan-content-preview')!;
    expect(preview.classList.contains('specorator-plan-read-error')).toBe(false);
    expect(preview.textContent).toContain('has content');
  });
});
