import type { ChatRuntimeQueryOptions } from '../../../core/runtime/types';
import type SpecoratorPlugin from '../../../main';
import type { BoundAgentProjection } from '../../agents/roster/boundAgentPersona';

/**
 * Builds per-turn ChatRuntimeQueryOptions, merging any bound-agent overrides
 * (prompt and model) into the base tab-model-override options. Precedence
 * (explicit model > boundAgentModel > settings.model) ensures an explicit
 * tab/work-order model is never clobbered by the agent binding. Extracted from
 * `InputController` — it reads only the plugin, no controller state.
 */
export async function resolveBoundAgentQueryOptions(
  plugin: SpecoratorPlugin,
  conversationId: string | null,
  tabModelOverride: string | null | undefined,
): Promise<ChatRuntimeQueryOptions> {
  const log = plugin.logger.scope('input');
  const base: ChatRuntimeQueryOptions = tabModelOverride ? { model: tabModelOverride } : {};

  if (!conversationId) {
    log.debug('[bound-agent] resolveTurnQueryOptions: no conversationId — skipping agent resolution');
    return base;
  }

  const conversation = await plugin.getConversationById(conversationId);
  if (!conversation?.boundAgentId) {
    log.debug('[bound-agent] resolveTurnQueryOptions: conversation has no boundAgentId', { conversationId, found: !!conversation });
    return base;
  }

  log.debug('[bound-agent] resolveTurnQueryOptions: resolving agent', { conversationId, boundAgentId: conversation.boundAgentId });

  // Pass the conversation's provider so the bound model is only folded in when
  // the agent's saved model targets that provider; after a disabled-provider
  // fallback the agent's cross-provider model id must not reach this runtime.
  const projection: BoundAgentProjection | null | undefined = await plugin.resolveBoundAgent?.(
    conversation.boundAgentId,
    conversation.providerId,
  );
  if (!projection) {
    log.debug('[bound-agent] resolveTurnQueryOptions: resolveBoundAgent returned null', { boundAgentId: conversation.boundAgentId });
    return base;
  }

  log.debug('[bound-agent] resolveTurnQueryOptions: agent resolved', { slug: projection.slug, hasPrompt: !!projection.prompt, promptLen: projection.prompt?.length });

  const boundAgentModel = projection.model || undefined;

  return {
    ...base,
    // Fold the bound model into `model` so non-Claude runtimes that only read
    // `queryOptions.model` (not `boundAgentModel`) receive it. Explicit
    // tab/work-order override takes precedence; boundAgentModel is the fallback.
    model: tabModelOverride ?? boundAgentModel,
    boundAgentPrompt: projection.prompt || undefined,
    boundAgentModel,
    boundAgentSlug: projection.slug || undefined,
    boundAgentDescription: projection.description || undefined,
  };
}
