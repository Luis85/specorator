import type { Component } from 'obsidian';
import { type Component as VueComponent, createApp, markRaw } from 'vue';

import type { ApprovalCallbackOptions } from '../../../core/runtime/types';
import type { ApprovalDecision, ExitPlanModeDecision } from '../../../core/types';
import type SpecoratorPlugin from '../../../main';
import type { PlanApprovalDecision } from '../rendering/InlinePlanApproval';
import InlineApproval from '../ui/vue/transcript/inline/InlineApproval.vue';
import InlineAskUserQuestion from '../ui/vue/transcript/inline/InlineAskUserQuestion.vue';
import InlineExitPlanMode from '../ui/vue/transcript/inline/InlineExitPlanMode.vue';
import InlinePlanApproval from '../ui/vue/transcript/inline/InlinePlanApproval.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '../ui/vue/transcript/transcriptKeys';

/** Handle to a mounted inline-prompt Vue card. `unmount` is idempotent. */
export interface InlineCardHandle {
  unmount(): void;
}

export interface ApprovalCardProps {
  resolve: (decision: ApprovalDecision) => void;
  toolName: string;
  description: string;
  approvalOptions?: ApprovalCallbackOptions;
}

export interface AskCardProps {
  resolve: (result: Record<string, string | string[]> | null) => void;
  input: Record<string, unknown>;
  signal?: AbortSignal;
  title?: string;
  showCustomInput?: boolean;
  immediateSelect?: boolean;
}

export interface ExitPlanModeCardProps {
  resolve: (decision: ExitPlanModeDecision | null) => void;
  signal?: AbortSignal;
  planPreview: string | null;
  planReadError: string | null;
  allowedPrompts?: Array<{ tool: string; prompt: string }>;
  resolvePlanContent?: () => string | null;
}

export interface PlanApprovalCardProps {
  resolve: (decision: PlanApprovalDecision | null) => void;
  planPreview: string | null;
  planReadError: string | null;
}

/**
 * Mounts the inline-prompt Vue cards into an engine-owned host element. Injected
 * into `InlinePromptController` so its Jest suite can supply a fake (Jest stubs
 * `.vue` imports, so it can't mount real cards) while production uses this real
 * `createApp` implementation. Each card settles its promise through its
 * `resolve` prop, and its `onBeforeUnmount → resolve(null)` makes `unmount` the
 * idiomatic equivalent of the legacy card's `destroy()`.
 */
export interface InlineCardMounter {
  mountApproval(host: HTMLElement, props: ApprovalCardProps): InlineCardHandle;
  mountAsk(host: HTMLElement, props: AskCardProps): InlineCardHandle;
  mountExitPlanMode(host: HTMLElement, props: ExitPlanModeCardProps): InlineCardHandle;
  mountPlanApproval(host: HTMLElement, props: PlanApprovalCardProps): InlineCardHandle;
}

export function createInlineCardMounter(
  plugin: SpecoratorPlugin,
  component: Component,
): InlineCardMounter {
  function mount(host: HTMLElement, card: VueComponent, props: Record<string, unknown>): InlineCardHandle {
    const container = host.ownerDocument.createElement('div');
    container.className = 'specorator-inline-card-mount';
    host.appendChild(container);

    const app = createApp(card, props);
    // markRaw: Obsidian objects are large and cyclic — never deep-proxy them.
    app.provide(APP_KEY, markRaw(plugin.app));
    app.provide(COMPONENT_KEY, markRaw(component));
    app.provide(PLUGIN_KEY, markRaw(plugin));
    app.mount(container);

    let done = false;
    return {
      unmount() {
        if (done) return;
        done = true;
        app.unmount();
        container.remove();
      },
    };
  }

  return {
    mountApproval: (host, props) => mount(host, InlineApproval, { ...props }),
    mountAsk: (host, props) => mount(host, InlineAskUserQuestion, { ...props }),
    mountExitPlanMode: (host, props) => mount(host, InlineExitPlanMode, { ...props }),
    mountPlanApproval: (host, props) => mount(host, InlinePlanApproval, { ...props }),
  };
}
