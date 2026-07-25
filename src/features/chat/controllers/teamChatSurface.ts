import type SpecoratorPlugin from '../../../main';

/**
 * Surface predicates for Team Chat's reuse of the sidebar chat engine. A Team Chat DM
 * carries `surface: 'team-chat'` plus a `boundAgentId`; the reused-island actions its
 * one-fixed-thread-per-agent model disallows (fork, `/clear`, `$`-resume, post-plan
 * new-session) gate on the first predicate, and the removed-agent read-only send guard on
 * the second. Centralized so `InputController` and `tabControllers` share ONE definition.
 * Unknown / non-team-chat conversations answer false / null.
 */
export function isTeamChatSurfaceConversation(
  plugin: SpecoratorPlugin,
  conversationId: string | null | undefined,
): boolean {
  return !!conversationId && plugin.getConversationSync(conversationId)?.surface === 'team-chat';
}

/**
 * The bound agent id when `conversationId` is a Team Chat DM, else null. Kept SYNCHRONOUS so
 * the removed-agent send guard can short-circuit before its async roster lookup on every
 * non-DM send, adding no microtask to the sidebar path.
 */
export function teamChatDmBoundAgentId(
  plugin: SpecoratorPlugin,
  conversationId: string | null | undefined,
): string | null {
  const conversation = conversationId ? plugin.getConversationSync(conversationId) : null;
  return conversation?.surface === 'team-chat' ? conversation.boundAgentId ?? null : null;
}
