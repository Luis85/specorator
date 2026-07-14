import { buildWebSearchSegments } from '@/features/chat/rendering/webSearchViewModel';

describe('buildWebSearchSegments', () => {
  it('projects parsed links before structured action data', () => {
    expect(buildWebSearchSegments(
      { actionType: 'search', query: 'ignored' },
      'Links: [{"title":"Docs","url":"https://example.com"}]\nSummary',
    )).toEqual([{
      type: 'links',
      links: [{ title: 'Docs', url: 'https://example.com' }],
      summary: 'Summary',
    }]);
  });

  it('projects open-page action lines followed by non-placeholder output', () => {
    expect(buildWebSearchSegments(
      { actionType: 'open_page', url: 'https://example.com' },
      'Fetched page',
    )).toEqual([
      {
        type: 'actionLines',
        lines: [
          { kind: 'text', text: 'Open page' },
          { kind: 'link', title: 'https://example.com', url: 'https://example.com' },
        ],
      },
      { type: 'rawLines', text: 'Fetched page', maxLines: 12 },
    ]);
  });

  it('falls back to raw output or an empty segment', () => {
    expect(buildWebSearchSegments({}, 'raw')).toEqual([
      { type: 'rawLines', text: 'raw', maxLines: 20 },
    ]);
    expect(buildWebSearchSegments({}, undefined)).toEqual([
      { type: 'empty', text: 'No result' },
    ]);
  });
});
