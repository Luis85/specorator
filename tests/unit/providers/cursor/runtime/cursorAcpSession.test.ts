import { resolveCursorAcpMode } from '@/providers/cursor/runtime/cursorAcpSession';

describe('resolveCursorAcpMode', () => {
  it('maps normal to agent mode with approvals routed to the card', () => {
    expect(resolveCursorAcpMode('normal')).toEqual({ modeId: 'agent', autoApprove: false });
  });
  it('maps yolo to agent mode with auto-approval', () => {
    expect(resolveCursorAcpMode('yolo')).toEqual({ modeId: 'agent', autoApprove: true });
  });
  it('maps plan to plan mode', () => {
    expect(resolveCursorAcpMode('plan')).toEqual({ modeId: 'plan', autoApprove: false });
  });
});
