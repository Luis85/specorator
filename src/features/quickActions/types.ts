/** YAML frontmatter `type` value for quick-action markdown files. */
export const QUICK_ACTION_FRONTMATTER_TYPE = 'quick-action';

export interface QuickAction {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tags?: string[];
  prompt: string;
  filePath: string;
  favorite?: boolean;
  favoriteRank?: number;
  /** Vault file mtime, populated by loadAll for recency sorting; not serialized to frontmatter. */
  mtime?: number;
}

export interface QuickActionFrontmatter {
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  favorite?: boolean;
  favoriteRank?: number;
}
