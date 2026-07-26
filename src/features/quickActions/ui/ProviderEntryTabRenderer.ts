import { setIcon } from 'obsidian';

import type { ProviderId } from '../../../core/providers/types';
import type { UsageRecord } from '../../../core/usage/types';
import { formatUsageBadge, loadBadgeI18n } from './formatUsageBadge';

const SKELETON_ROWS = 4;

/** The minimum every provider-backed picker row must expose. */
export interface ProviderEntryRow {
  id: string;
  providerId: ProviderId;
  providerDisplayName: string;
  name: string;
  description: string;
  providerEnabled: boolean;
}

/**
 * The slice of an aggregator this renderer needs. Both `VaultSkillSource` and
 * `ProviderCommandSource` satisfy it structurally.
 */
export interface ProviderEntrySource<T> {
  listCachedNow(): T[];
  listAllStreaming(
    onProviderResolved: (providerId: ProviderId, entries: T[]) => void,
  ): Promise<void>;
  invalidate(providerId?: ProviderId): void;
}

export interface ProviderEntryTabLabels {
  searchPlaceholder: string;
  refreshTooltip: string;
  noResults: string;
  emptyLead: string;
  emptyHint: string;
  disabledBadge: string;
}

export interface ProviderEntryTabConfig<T extends ProviderEntryRow> {
  source: ProviderEntrySource<T>;
  /** Extra class on the list container, alongside the shared list class. */
  listCls: string;
  /** Extra class on each row, alongside the shared row class. */
  rowCls: string;
  /** Extra class on each row's clickable main area. */
  mainCls: string;
  /** Lucide icon rendered at the head of each row. */
  icon: string;
  labels: ProviderEntryTabLabels;
  onRun: (entry: T) => void;
  close: () => void;
  /** Optional trailing text under the description (e.g. an argument hint). */
  hint?: (entry: T) => string | null;
  /** Optional inline usage badge. Omit to render none. */
  usage?: {
    tracker: { getAll(): ReadonlyMap<string, UsageRecord> };
    key: (entry: T) => string;
    badgeCls: string;
    now: () => number;
  };
  /** Optional per-row trailing actions (e.g. the Skills tab's Edit button). */
  renderActions?: (row: HTMLElement, entry: T) => void;
}

/**
 * Shared renderer for the modal's provider-backed picker tabs (Skills,
 * Commands). Owns search, the stale-while-revalidate two-phase paint, the
 * per-provider streaming patch, and row rendering; everything provider- or
 * kind-specific arrives through `ProviderEntryTabConfig`.
 */
export class ProviderEntryTabRenderer<T extends ProviderEntryRow> {
  private entries: T[] = [];
  private filter = '';
  private searchInputEl: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  /**
   * Flips once a full streaming pass has settled. Until then an empty list
   * paints the skeleton; afterwards it paints the empty-state copy — otherwise
   * a provider that genuinely has no entries showed a skeleton forever.
   */
  private loaded = false;
  /**
   * Monotonic per-refresh token. Only the newest refresh may patch rows or flip
   * `loaded`. The aggregator's generation guard stops a retired fetch from
   * COMMITTING to the cache, but the retired promise still resolves and still
   * delivers its rows — so a Refresh clicked mid-fetch could see the newer pass
   * paint first and the older one overwrite it with stale commands. Token-gating
   * here also covers a re-`render()` (tab switch away and back), where a late
   * callback from the previous pass would otherwise patch into the new list.
   */
  private refreshToken = 0;

  constructor(private config: ProviderEntryTabConfig<T>) {}

  async render(host: HTMLElement): Promise<HTMLInputElement | null> {
    this.filter = '';
    this.buildSearch(host);
    this.listEl = host.createDiv({
      cls: `specorator-quick-actions-list ${this.config.listCls}`,
    });

    // Phase A: instant paint from in-memory cache (may be empty on cold start).
    this.entries = this.config.source.listCachedNow();
    this.renderList();

    // Phase B: background refresh, streaming per-provider updates.
    void this.refresh();

    return this.searchInputEl;
  }

  private async refresh(): Promise<void> {
    const token = ++this.refreshToken;
    await this.config.source.listAllStreaming((providerId, entries) => {
      if (token !== this.refreshToken) return;
      this.patchProvider(providerId, entries);
    });
    if (token !== this.refreshToken) return;
    this.loaded = true;
    this.renderList();
  }

  private patchProvider(providerId: ProviderId, freshEntries: T[]): void {
    this.entries = this.entries.filter((e) => e.providerId !== providerId);
    this.entries.push(...freshEntries);
    this.renderList();
  }

  private buildSearch(host: HTMLElement): void {
    const searchWrap = host.createDiv({ cls: 'specorator-quick-actions-search' });
    const inputContainer = searchWrap.createDiv({
      cls: 'specorator-quick-actions-search-container',
    });
    const placeholder = this.config.labels.searchPlaceholder;
    this.searchInputEl = inputContainer.createEl('input', {
      type: 'search',
      cls: 'specorator-quick-actions-search-input',
      attr: { placeholder, 'aria-label': placeholder },
    });
    this.searchInputEl.addEventListener('input', () => {
      this.filter = this.searchInputEl?.value ?? '';
      this.renderList();
    });
    this.searchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.runFirstMatch();
      } else if (e.key === 'Escape' && this.searchInputEl?.value) {
        e.preventDefault();
        e.stopPropagation();
        this.searchInputEl.value = '';
        this.filter = '';
        this.renderList();
      }
    });

    const refreshBtn = inputContainer.createEl('button', {
      cls: 'specorator-quick-actions-search-refresh',
      attr: {
        type: 'button',
        title: this.config.labels.refreshTooltip,
        'aria-label': this.config.labels.refreshTooltip,
      },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => {
      this.config.source.invalidate();
      void this.refresh();
    });
  }

  private renderList(): void {
    if (!this.listEl) return;
    this.listEl.empty();
    this.listEl.removeClass('specorator-quick-actions-skills-empty');

    if (this.entries.length === 0) {
      if (this.loaded) {
        this.renderEmptyState();
      } else {
        this.renderSkeleton();
      }
      return;
    }

    const filtered = this.orderedEntries();

    if (filtered.length === 0) {
      this.listEl.createDiv({
        cls: 'specorator-quick-actions-empty-results',
        text: this.config.labels.noResults,
      });
      return;
    }

    let lastProvider: string | null = null;
    for (const entry of filtered) {
      if (entry.providerId !== lastProvider) {
        this.listEl.createDiv({
          cls: 'specorator-quick-actions-provider-header',
          text: entry.providerDisplayName,
        });
        lastProvider = entry.providerId;
      }
      this.renderRow(entry);
    }
  }

  private renderEmptyState(): void {
    if (!this.listEl) return;
    this.listEl.removeClass('specorator-quick-actions-skills-skeleton');
    this.listEl.addClass('specorator-quick-actions-skills-empty');
    this.listEl.createDiv({
      cls: 'specorator-quick-actions-skills-empty-lead',
      text: this.config.labels.emptyLead,
    });
    this.listEl.createDiv({
      cls: 'specorator-quick-actions-skills-empty-hint',
      text: this.config.labels.emptyHint,
    });
  }

  private renderSkeleton(): void {
    if (!this.listEl) return;
    this.listEl.addClass('specorator-quick-actions-skills-skeleton');
    for (let i = 0; i < SKELETON_ROWS; i++) {
      const row = this.listEl.createDiv({
        cls: `specorator-quick-action-row ${this.config.rowCls} is-skeleton`,
      });
      row.createDiv({ cls: 'specorator-quick-action-icon is-skeleton-block' });
      const text = row.createDiv({ cls: 'specorator-quick-action-text' });
      text.createDiv({ cls: 'is-skeleton-line is-skeleton-line-title' });
      text.createDiv({ cls: 'is-skeleton-line is-skeleton-line-desc' });
    }
  }

  /**
   * The rows in display order: filtered, then grouped by provider and sorted by
   * name. Copied before sorting — `applyFilter` returns `this.entries` itself
   * when the search box is empty, so an in-place sort would reorder the
   * renderer's own backing array as a side effect of painting.
   */
  private orderedEntries(): T[] {
    return [...this.applyFilter(this.entries)].sort((a, b) => (
      a.providerId !== b.providerId
        ? a.providerId.localeCompare(b.providerId)
        : a.name.localeCompare(b.name)
    ));
  }

  private applyFilter(entries: T[]): T[] {
    const needle = this.filter.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => {
      if (e.name.toLowerCase().includes(needle)) return true;
      if (e.description.toLowerCase().includes(needle)) return true;
      if (e.providerDisplayName.toLowerCase().includes(needle)) return true;
      return false;
    });
  }

  private runFirstMatch(): void {
    // MUST read the same ordering `renderList` paints. Streaming callbacks push
    // each provider's rows in resolution order, so the raw filtered array's
    // first element is whichever provider answered first — pressing Enter would
    // run a different command than the top row the user is looking at.
    const first = this.orderedEntries()[0];
    if (!first) return;
    this.config.onRun(first);
    this.config.close();
  }

  private renderRow(entry: T): void {
    if (!this.listEl) return;

    const row = this.listEl.createDiv({
      cls: `specorator-quick-action-row ${this.config.rowCls}`,
    });
    if (!entry.providerEnabled) {
      row.addClass('is-provider-disabled');
    }

    const main = row.createDiv({
      cls: `specorator-quick-action-main ${this.config.mainCls}`,
    });

    const iconEl = main.createSpan({ cls: 'specorator-quick-action-icon' });
    setIcon(iconEl, this.config.icon);

    this.renderRowText(main.createDiv({ cls: 'specorator-quick-action-text' }), entry);

    main.addEventListener('click', () => {
      this.config.onRun(entry);
      this.config.close();
    });

    this.config.renderActions?.(row, entry);
  }

  private renderRowText(textCol: HTMLElement, entry: T): void {
    textCol.createEl('strong', { text: entry.name });
    if (entry.description) {
      textCol.createDiv({
        cls: 'specorator-quick-action-desc',
        text: entry.description,
      });
    }
    const hint = this.config.hint?.(entry);
    if (hint) {
      textCol.createDiv({ cls: 'specorator-quick-action-hint', text: hint });
    }
    const usage = this.config.usage;
    if (usage) {
      const record = usage.tracker.getAll().get(usage.key(entry)) ?? null;
      textCol.createSpan({
        cls: usage.badgeCls,
        text: formatUsageBadge(record, usage.now(), loadBadgeI18n()),
      });
    }
    if (!entry.providerEnabled) {
      textCol.createSpan({
        cls: 'specorator-quick-actions-skill-disabled-badge',
        text: this.config.labels.disabledBadge,
      });
    }
  }
}
