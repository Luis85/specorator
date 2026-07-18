/**
 * Fetches the marketplace catalog over HTTPS using Obsidian's `requestUrl`
 * (which bypasses renderer CORS — a raw `fetch` cannot reliably reach
 * raw.githubusercontent.com from a plugin). Every URL is SSRF-vetted before the
 * dial. The request + vet seams are injectable so unit tests need no network.
 */
import { requestUrl } from 'obsidian';

import { assertSafeRemoteUrl } from '../../core/security/urlSafety';
import { type MarketplaceManifest, parseManifest } from './catalogTypes';

/** Default catalog: the curated Specorator marketplace repo's `main` branch. */
export const DEFAULT_MARKETPLACE_BASE_URL =
  'https://raw.githubusercontent.com/Luis85/specorator-marketplace/main/';

export class MarketplaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketplaceError';
  }
}

export interface CatalogHttpResponse {
  status: number;
  text: string;
}
export type CatalogRequestFn = (url: string) => Promise<CatalogHttpResponse>;
export type UrlVetFn = (url: string) => Promise<void>;

const obsidianRequest: CatalogRequestFn = async (url) => {
  // throw:false → we inspect status ourselves so a 404/rate-limit is a typed
  // MarketplaceError, not an opaque throw.
  const res = await requestUrl({ url, method: 'GET', throw: false });
  return { status: res.status, text: res.text };
};

const ssrfVet: UrlVetFn = async (url) => {
  try {
    await assertSafeRemoteUrl(url);
  } catch (error) {
    throw new MarketplaceError(error instanceof Error ? error.message : String(error));
  }
};

export class MarketplaceCatalogClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly request: CatalogRequestFn = obsidianRequest,
    private readonly vet: UrlVetFn = ssrfVet,
  ) {
    this.base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  /** Fetches + validates the catalog manifest (one request). */
  async fetchIndex(): Promise<MarketplaceManifest> {
    const text = await this.getText('index.json');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new MarketplaceError('The marketplace index.json is not valid JSON.');
    }
    const manifest = parseManifest(raw);
    if (!manifest) {
      throw new MarketplaceError('The marketplace index.json has an unsupported or invalid shape.');
    }
    return manifest;
  }

  /** Fetches one item's raw Markdown body (for preview / install). */
  async fetchItemBody(relativePath: string): Promise<string> {
    return this.getText(relativePath);
  }

  private async getText(relativePath: string): Promise<string> {
    const url = this.resolve(relativePath);
    await this.vet(url);
    let res: CatalogHttpResponse;
    try {
      res = await this.request(url);
    } catch (error) {
      throw new MarketplaceError(
        `Could not reach the marketplace: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw new MarketplaceError(`Marketplace request failed (HTTP ${res.status}) for ${relativePath}.`);
    }
    return res.text;
  }

  private resolve(relativePath: string): string {
    return new URL(relativePath, this.base).toString();
  }
}
