import { isSupportedNode, parseNodeMajor } from '@/providers/claude/toolHost/nodeVersion';

describe('nodeVersion', () => {
  it('parses the major version', () => {
    expect(parseNodeMajor('v18.20.4\n')).toBe(18);
    expect(parseNodeMajor('v22.3.0')).toBe(22);
    expect(parseNodeMajor('garbage')).toBeNull();
  });
  it('gates on >= 18', () => {
    expect(isSupportedNode(18)).toBe(true);
    expect(isSupportedNode(16)).toBe(false);
    expect(isSupportedNode(null)).toBe(false);
  });
});
