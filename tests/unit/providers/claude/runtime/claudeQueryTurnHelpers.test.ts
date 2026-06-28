import type { ChatRuntimeQueryOptions, ChatTurnRequest, PreparedChatTurn } from '@/core/runtime/types';
import { buildQueryOptionsFromTurnRequest } from '@/providers/claude/runtime/claudeQueryTurnHelpers';

function makeTurn(overrides?: Partial<ChatTurnRequest>): PreparedChatTurn {
  const request: ChatTurnRequest = { text: 'hello', ...overrides };
  return {
    request,
    persistedContent: 'hello',
    prompt: 'hello',
    isCompact: false,
    mcpMentions: new Set(),
  };
}

describe('buildQueryOptionsFromTurnRequest', () => {
  it('returns undefined when nothing is set on the turn or the explicit options', () => {
    const result = buildQueryOptionsFromTurnRequest(makeTurn().request, makeTurn());
    expect(result).toBeUndefined();
  });

  // Regression: the bound roster-agent persona/model rode in on the explicit
  // query options but were dropped when the prepared-turn path rebuilt the
  // object field-by-field, so agent chats answered with the generic identity.
  it('preserves boundAgentPrompt and boundAgentModel from the explicit options', () => {
    const turn = makeTurn();
    const explicit: ChatRuntimeQueryOptions = {
      boundAgentPrompt: 'You are Ada, a Rust expert.',
      boundAgentModel: 'opus',
    };

    const result = buildQueryOptionsFromTurnRequest(turn.request, turn, explicit);

    expect(result).toBeDefined();
    expect(result?.boundAgentPrompt).toBe('You are Ada, a Rust expert.');
    expect(result?.boundAgentModel).toBe('opus');
  });

  it('keeps bound-agent fields alongside other preserved options', () => {
    const turn = makeTurn();
    const explicit: ChatRuntimeQueryOptions = {
      model: 'opus',
      boundAgentPrompt: 'You are Ada.',
      boundAgentModel: 'opus',
    };

    const result = buildQueryOptionsFromTurnRequest(turn.request, turn, explicit);

    expect(result?.model).toBe('opus');
    expect(result?.boundAgentPrompt).toBe('You are Ada.');
    expect(result?.boundAgentModel).toBe('opus');
  });
});
