/**
 * Fetches the marketplace catalog over HTTPS using Obsidian's `requestUrl`
 * (which bypasses renderer CORS — a raw `fetch` cannot reliably reach
 * raw.githubusercontent.com from a plugin). The request + vet seams are
 * injectable so unit tests need no network.
 *
 * SSRF posture: every request URL is SSRF-vetted (`assertSafeRemoteUrl`) before
 * the dial AND constrained to stay under the configured base URL (`resolve`), so
 * the URLs this client *constructs* can't point off the source origin. Two
 * residuals remain, both because `requestUrl` (mandated for the renderer CORS
 * bypass) is a high-level API with no low-level socket hooks:
 *   - DNS rebinding — the vet is preflight-only; `requestUrl` re-resolves and
 *     exposes no `lookup`/agent, so `createPinnedLookup` (the Node-socket pin the
 *     MCP transports use) can't be applied.
 *   - HTTP redirects — `requestUrl` auto-follows 3xx with no manual-redirect or
 *     final-URL hook, so a mirror that passes the vet could 302 to an internal
 *     address without its `Location` being re-vetted.
 * Both are bounded to a NON-DEFAULT, user-configured source (the default is the
 * trusted marketplace repo, which does neither); closing them fully would mean
 * moving off `requestUrl` to a pinned, redirect-vetting Node http(s) socket — a
 * deliberate trade against the CORS bypass, left to the source owner.
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
  } catch {
    // The shared SSRF guard's message talks about "remote MCP servers", which is
    // misleading in the catalog UI — re-wrap with marketplace-context wording.
    throw new MarketplaceError(
      `Blocked for safety: "${url}" is not a permitted marketplace address (must be a public http(s) URL).`,
    );
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
    const resolved = new URL(relativePath, this.base).toString();
    // An absolute or `../`-laden item path could resolve to a different origin
    // or repo while still passing the SSRF vet (both public) — a provenance
    // spoof. Require the resolved URL to stay under the configured base URL.
    if (!resolved.startsWith(this.base)) {
      throw new MarketplaceError(
        `Refusing to fetch "${relativePath}" — it escapes the marketplace base URL.`,
      );
    }
    return resolved;
  }
}
