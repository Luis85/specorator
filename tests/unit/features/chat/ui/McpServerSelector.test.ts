import { McpServerSelector } from '@/features/chat/ui/toolbar/McpServerSelector';

// Retained-API safety net for the Phase 2 toolbar cutover: the DOM-render layer
// was stripped, but the engine (ConversationController restore/gating, tabShared
// provider gating, per-turn getEnabledServers, `@server` mention sync) still
// drives the held enabled-server set through these public methods.
describe('McpServerSelector (retained engine object)', () => {
  it('constructs with no arguments and starts empty', () => {
    const selector = new McpServerSelector();
    expect(selector.getEnabledServers().size).toBe(0);
  });

  it('setEnabledServers replaces the held set (history restore path)', () => {
    const selector = new McpServerSelector();
    selector.setEnabledServers(['a', 'b']);
    expect([...selector.getEnabledServers()].sort()).toEqual(['a', 'b']);

    selector.setEnabledServers(['c']);
    expect([...selector.getEnabledServers()]).toEqual(['c']);
  });

  it('addMentionedServers unions into the held set (@server mention sync)', () => {
    const selector = new McpServerSelector();
    selector.setEnabledServers(['a']);
    selector.addMentionedServers(new Set(['b', 'c']));
    expect([...selector.getEnabledServers()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('clearEnabled empties the held set (no-MCP-support gating path)', () => {
    const selector = new McpServerSelector();
    selector.setEnabledServers(['a', 'b']);
    selector.clearEnabled();
    expect(selector.getEnabledServers().size).toBe(0);
  });

  it('setVisible remains callable after the DOM strip (no-op)', () => {
    const selector = new McpServerSelector();
    expect(() => {
      selector.setVisible(false);
      selector.setVisible(true);
    }).not.toThrow();
  });

  it('setMcpManager prunes enabled servers no longer active and fires onChange', () => {
    const selector = new McpServerSelector();
    const onChange = jest.fn();
    selector.setOnChange(onChange);
    selector.setEnabledServers(['keep', 'drop']);

    const manager = {
      getServers: () => [
        { name: 'keep', enabled: true },
        { name: 'drop', enabled: false },
      ],
    } as unknown as Parameters<McpServerSelector['setMcpManager']>[0];

    selector.setMcpManager(manager);

    expect([...selector.getEnabledServers()]).toEqual(['keep']);
    expect(onChange).toHaveBeenCalled();
  });
});
