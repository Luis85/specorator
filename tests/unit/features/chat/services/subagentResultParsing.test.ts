import {
  extractAgentIdFromRecord,
  hasTerminalTaskStatus,
  isRecord,
  isTerminalTaskStatusValue,
  parsedResultIndicatesRunning,
  parseJsonRecord,
  plainPayloadIndicatesRunning,
} from '@/features/chat/services/subagentResultParsing';

describe('subagentResultParsing', () => {
  describe('isRecord / parseJsonRecord', () => {
    it('recognizes plain objects only', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord([])).toBe(false);
      expect(isRecord(null)).toBe(false);
      expect(isRecord('x')).toBe(false);
    });

    it('parses a JSON object, returns null for non-objects and bad JSON', () => {
      expect(parseJsonRecord('{"a":1}')).toEqual({ a: 1 });
      expect(parseJsonRecord('[1,2]')).toBeNull();
      expect(parseJsonRecord('not json')).toBeNull();
    });
  });

  describe('isTerminalTaskStatusValue', () => {
    it.each(['completed', 'success', 'error', 'COMPLETED'])('treats %s as terminal', (s) => {
      expect(isTerminalTaskStatusValue(s)).toBe(true);
    });
    it.each(['running', 'pending', 'not_ready', '', 42, undefined])('treats %s as non-terminal', (s) => {
      expect(isTerminalTaskStatusValue(s)).toBe(false);
    });
  });

  describe('hasTerminalTaskStatus', () => {
    it('reads retrieval_status then status', () => {
      expect(hasTerminalTaskStatus({ retrieval_status: 'completed' })).toBe(true);
      expect(hasTerminalTaskStatus({ status: 'error' })).toBe(true);
      expect(hasTerminalTaskStatus({ status: 'running' })).toBe(false);
      expect(hasTerminalTaskStatus('nope')).toBe(false);
    });
  });

  describe('extractAgentIdFromRecord', () => {
    it('reads direct then nested data agent ids', () => {
      expect(extractAgentIdFromRecord({ agent_id: 'a1' })).toBe('a1');
      expect(extractAgentIdFromRecord({ agentId: 'a2' })).toBe('a2');
      expect(extractAgentIdFromRecord({ data: { agent_id: 'a3' } })).toBe('a3');
      expect(extractAgentIdFromRecord({ data: {} })).toBeNull();
      expect(extractAgentIdFromRecord({})).toBeNull();
    });
  });

  describe('parsedResultIndicatesRunning', () => {
    it('detects top-level running status', () => {
      expect(parsedResultIndicatesRunning({ status: 'running' })).toBe(true);
      expect(parsedResultIndicatesRunning({ retrieval_status: 'not_ready' })).toBe(true);
    });
    it('detects a running agent in the agents map', () => {
      expect(parsedResultIndicatesRunning({ agents: { a: { status: 'pending' } } })).toBe(true);
      expect(parsedResultIndicatesRunning({ agents: { a: { status: 'completed' } } })).toBe(false);
      expect(parsedResultIndicatesRunning({ agents: {} })).toBe(false);
    });
  });

  describe('plainPayloadIndicatesRunning', () => {
    it('matches not_ready text and xml status tags', () => {
      expect(plainPayloadIndicatesRunning('status: not ready')).toBe(true);
      expect(plainPayloadIndicatesRunning('<status>running</status>')).toBe(true);
      expect(plainPayloadIndicatesRunning('<status>completed</status>')).toBe(false);
      expect(plainPayloadIndicatesRunning('all done')).toBe(false);
    });
  });
});
