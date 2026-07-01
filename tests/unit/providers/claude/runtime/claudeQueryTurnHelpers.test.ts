import type { ChatTurnRequest, PreparedChatTurn } from '@/core/runtime/types';
import { buildQueryOptionsFromTurnRequest } from '@/providers/claude/runtime/claudeQueryTurnHelpers';

const minRequest = (): ChatTurnRequest => ({ text: 'hello' });
const minTurn = (): PreparedChatTurn => ({
  request: minRequest(),
  persistedContent: 'hello',
  prompt: 'hello',
  isCompact: false,
  mcpMentions: new Set(),
});

describe('buildQueryOptionsFromTurnRequest', () => {
  it('returns undefined when no options and no mcpMentions', () => {
    expect(buildQueryOptionsFromTurnRequest(minRequest(), minTurn())).toBeUndefined();
  });

  // Regression: the bound roster-agent persona/model rode in on the explicit
  // query options but were dropped when the prepared-turn path rebuilt the
  // object field-by-field, so agent chats answered with the generic identity.
  it('passes bound-agent fields through to effective options', () => {
    const result = buildQueryOptionsFromTurnRequest(minRequest(), minTurn(), {
      boundAgentPrompt: 'You are a code reviewer.',
      boundAgentSlug: 'code-reviewer',
      boundAgentModel: 'sonnet',
      boundAgentDescription: 'Reviews code for issues.',
    });

    expect(result).not.toBeUndefined();
    expect(result?.boundAgentPrompt).toBe('You are a code reviewer.');
    expect(result?.boundAgentSlug).toBe('code-reviewer');
    expect(result?.boundAgentModel).toBe('sonnet');
    expect(result?.boundAgentDescription).toBe('Reviews code for issues.');
  });

  it('keeps bound-agent fields alongside other preserved options', () => {
    const result = buildQueryOptionsFromTurnRequest(minRequest(), minTurn(), {
      model: 'opus',
      boundAgentPrompt: 'You are Ada.',
      boundAgentModel: 'opus',
    });

    expect(result?.model).toBe('opus');
    expect(result?.boundAgentPrompt).toBe('You are Ada.');
    expect(result?.boundAgentModel).toBe('opus');
  });

  it('returns non-undefined when only bound-agent fields are set', () => {
    // Regression: previously returned undefined because bound-agent fields
    // were not included in the early-return emptiness check.
    const result = buildQueryOptionsFromTurnRequest(minRequest(), minTurn(), {
      boundAgentPrompt: 'You are a code reviewer.',
    });
    expect(result).not.toBeUndefined();
  });

  it('merges mcpMentions from turn and legacyQueryOptions', () => {
    const turn = minTurn();
    turn.mcpMentions = new Set(['server-a']);
    const result = buildQueryOptionsFromTurnRequest(minRequest(), turn, {
      mcpMentions: new Set(['server-b']),
    });
    expect(result?.mcpMentions).toEqual(new Set(['server-a', 'server-b']));
  });

  it('prefers request.enabledMcpServers over legacyQueryOptions', () => {
    const request = { ...minRequest(), enabledMcpServers: new Set(['req-server']) };
    const result = buildQueryOptionsFromTurnRequest(request, minTurn(), {
      enabledMcpServers: new Set(['legacy-server']),
    });
    expect(result?.enabledMcpServers).toEqual(new Set(['req-server']));
  });
});
