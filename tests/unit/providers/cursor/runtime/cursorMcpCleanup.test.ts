import { withoutSpecoratorServer } from '../../../../../src/providers/cursor/runtime/cursorMcpCleanup';

describe('withoutSpecoratorServer', () => {
  it('removes a stale mcpServers.specorator entry and reports the change', () => {
    const { changed, result } = withoutSpecoratorServer({
      mcpServers: {
        specorator: { url: 'http://127.0.0.1:51234', headers: {} },
        other: { url: 'http://example.test' },
      },
    });

    expect(changed).toBe(true);
    expect(result.mcpServers).toEqual({ other: { url: 'http://example.test' } });
  });

  it('preserves unrelated top-level keys', () => {
    const { changed, result } = withoutSpecoratorServer({
      someOtherKey: { keep: true },
      mcpServers: { specorator: { url: 'x', headers: {} } },
    });

    expect(changed).toBe(true);
    expect(result.someOtherKey).toEqual({ keep: true });
    expect(result.mcpServers).toEqual({});
  });

  it('reports no change when there is no specorator entry', () => {
    const input = { mcpServers: { other: { url: 'http://example.test' } } };
    const { changed, result } = withoutSpecoratorServer(input);

    expect(changed).toBe(false);
    expect(result).toEqual(input);
  });

  it('reports no change when there is no mcpServers key', () => {
    const input = { someOtherKey: { keep: true } };
    const { changed, result } = withoutSpecoratorServer(input);

    expect(changed).toBe(false);
    expect(result).toEqual(input);
  });

  it('reports no change for an empty / missing config object', () => {
    expect(withoutSpecoratorServer({}).changed).toBe(false);
    expect(withoutSpecoratorServer(null).changed).toBe(false);
  });
});
