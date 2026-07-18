import { MarketplaceCatalogClient, MarketplaceError } from '@/features/marketplace/MarketplaceCatalogClient';

const noVet = async (): Promise<void> => {};
const validManifest = JSON.stringify({
  schemaVersion: 1,
  catalog: 'specorator-marketplace',
  count: 1,
  items: [{ id: 'loops/x', type: 'loop', name: 'X', description: 'd', path: 'loops/x.md', tags: [] }],
});

describe('MarketplaceCatalogClient', () => {
  it('fetches and parses the index, resolving against the base', async () => {
    const request = jest.fn(async () => ({ status: 200, text: validManifest }));
    const client = new MarketplaceCatalogClient('https://example.test/base/', request, noVet);
    const manifest = await client.fetchIndex();
    expect(manifest.items).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('https://example.test/base/index.json');
  });

  it('appends a missing trailing slash to the base', async () => {
    const request = jest.fn(async () => ({ status: 200, text: '# body' }));
    const client = new MarketplaceCatalogClient('https://example.test/base', request, noVet);
    const body = await client.fetchItemBody('loops/x.md');
    expect(body).toBe('# body');
    expect(request).toHaveBeenCalledWith('https://example.test/base/loops/x.md');
  });

  it('throws a MarketplaceError on a non-2xx status', async () => {
    const client = new MarketplaceCatalogClient('https://example.test/base/', async () => ({ status: 404, text: '' }), noVet);
    await expect(client.fetchIndex()).rejects.toBeInstanceOf(MarketplaceError);
  });

  it('throws on a non-JSON index', async () => {
    const client = new MarketplaceCatalogClient('https://example.test/base/', async () => ({ status: 200, text: 'not json' }), noVet);
    await expect(client.fetchIndex()).rejects.toThrow(/not valid JSON/);
  });

  it('throws on an invalid manifest shape', async () => {
    const client = new MarketplaceCatalogClient('https://example.test/base/', async () => ({ status: 200, text: '{"schemaVersion":2}' }), noVet);
    await expect(client.fetchIndex()).rejects.toThrow(/unsupported or invalid/);
  });

  it('vets every URL and surfaces vet failures', async () => {
    const vet = jest.fn(async () => {
      throw new MarketplaceError('blocked for safety');
    });
    const request = jest.fn(async () => ({ status: 200, text: validManifest }));
    const client = new MarketplaceCatalogClient('https://example.test/base/', request, vet);
    await expect(client.fetchIndex()).rejects.toThrow(/blocked for safety/);
    expect(vet).toHaveBeenCalledWith('https://example.test/base/index.json');
    expect(request).not.toHaveBeenCalled();
  });
});
