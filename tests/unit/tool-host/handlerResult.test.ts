import { toCallToolResult } from '@/tool-host/handlerResult';

describe('toCallToolResult', () => {
  it('wraps a string into a text content result', () => {
    expect(toCallToolResult('hi')).toEqual({ content: [{ type: 'text', text: 'hi' }] });
  });

  it('passes a well-formed MCP object through unchanged', () => {
    const obj = { content: [{ type: 'text' as const, text: 'x' }], isError: true };
    expect(toCallToolResult(obj)).toBe(obj);
  });

  it('coerces a non-string, non-result value to JSON text', () => {
    expect(toCallToolResult({ a: 1 } as unknown as string)).toEqual({
      content: [{ type: 'text', text: '{"a":1}' }],
    });
  });

  it('maps an undefined (side-effect-only) return to an empty text result', () => {
    expect(toCallToolResult(undefined)).toEqual({ content: [{ type: 'text', text: '' }] });
    expect(toCallToolResult(null)).toEqual({ content: [{ type: 'text', text: '' }] });
  });
});
