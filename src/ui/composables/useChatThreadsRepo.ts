import { inject } from 'vue'
import type { ChatThreadsRepositoryPort } from '@/domain/ports/ChatThreadsRepositoryPort'
import { CHAT_THREADS_REPO } from '@/infrastructure/bridge/ports'

/**
 * Composable accessor for the {@link ChatThreadsRepositoryPort} (ADR-008,
 * WP-14). Throws if no repository was provided — there is no sensible
 * defaulting behaviour for a missing persistence port, and silently
 * returning a stub would mask wiring bugs.
 *
 * Consumed by `SpecoratorView` and `AgentSidepanelView` to load + save the
 * `chatThreads` map. UI components do NOT call this directly: store
 * persistence is the views' responsibility.
 */
export function useChatThreadsRepo(): ChatThreadsRepositoryPort {
  const port = inject(CHAT_THREADS_REPO, null)
  if (port === null) {
    throw new Error('ChatThreadsRepositoryPort was not provided')
  }
  return port
}
