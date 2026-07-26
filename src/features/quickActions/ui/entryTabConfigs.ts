import { t } from '@/i18n/i18n';

import type { UsageRecord } from '../../../core/usage/types';
import { isCloneableSkillPath } from '../../skills/skillCloning';
import type { CommandTabEntry, ProviderCommandSource } from '../commands/types';
import type { SkillTabEntry, VaultSkillSource } from '../skills/types';
import type { ProviderEntryTabConfig } from './ProviderEntryTabRenderer';

type UsageTracker = { getAll(): ReadonlyMap<string, UsageRecord> } | null;

export interface EntryTabDeps {
  close: () => void;
  usageTracker: UsageTracker;
  now: () => number;
}

export function buildSkillsTabConfig(
  source: VaultSkillSource,
  onRun: (entry: SkillTabEntry) => void,
  onEdit: (entry: SkillTabEntry) => void,
  deps: EntryTabDeps,
): ProviderEntryTabConfig<SkillTabEntry> {
  return {
    source,
    listCls: 'specorator-quick-actions-skill-list',
    rowCls: 'specorator-quick-actions-skill-row',
    mainCls: 'specorator-quick-actions-skill-row-main',
    icon: 'book-open',
    labels: {
      searchPlaceholder: t('quickActions.skills.searchPlaceholder'),
      refreshTooltip: t('quickActions.skills.refreshTooltip'),
      noResults: t('quickActions.skills.noResults'),
      emptyLead: t('quickActions.skills.emptyAll'),
      emptyHint: t('quickActions.skills.emptyHint'),
      disabledBadge: t('quickActions.skills.disabledBadge'),
    },
    onRun,
    close: deps.close,
    ...(deps.usageTracker
      ? {
        usage: {
          tracker: deps.usageTracker,
          key: (entry: SkillTabEntry) => `skill:${entry.providerId}:${entry.name}`,
          badgeCls: 'specorator-skill-usage-badge',
          now: deps.now,
        },
      }
      : {}),
    // Only vault-editable skills get an "Edit in <provider> settings" button. A
    // read-only user skill (`~/.claude/skills`) has a truthy host-absolute path
    // but isn't manageable — the settings manager filters it out — so a bare
    // truthiness check would render a dead button. Same gate the Library uses.
    renderActions: (row, entry) => {
      if (!isCloneableSkillPath(entry.sourceFilePath)) return;
      const actions = row.createDiv({ cls: 'specorator-quick-action-actions' });
      const editBtn = actions.createEl('button', {
        cls: 'specorator-quick-actions-skill-edit',
        text: t('quickActions.skills.editInSettings', {
          provider: entry.providerDisplayName,
        }),
      });
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deps.close();
        onEdit(entry);
      });
    },
  };
}

export function buildCommandsTabConfig(
  source: ProviderCommandSource,
  onRun: (entry: CommandTabEntry) => void,
  deps: Pick<EntryTabDeps, 'close'>,
): ProviderEntryTabConfig<CommandTabEntry> {
  return {
    source,
    listCls: 'specorator-quick-actions-command-list',
    rowCls: 'specorator-quick-actions-command-row',
    mainCls: 'specorator-quick-actions-command-row-main',
    icon: 'terminal',
    labels: {
      searchPlaceholder: t('quickActions.commands.searchPlaceholder'),
      refreshTooltip: t('quickActions.commands.refreshTooltip'),
      noResults: t('quickActions.commands.noResults'),
      emptyLead: t('quickActions.commands.emptyAll'),
      emptyHint: t('quickActions.commands.emptyHint'),
      disabledBadge: t('quickActions.commands.disabledBadge'),
    },
    onRun,
    close: deps.close,
    // Commands are provider-owned (SDK, plugin, or `.claude/commands/`) and the
    // modal has no editor for them, so there are no row actions. An
    // argument-taking command advertises that clicking seeds the composer
    // rather than sending — see `runProviderCommand`.
    hint: (entry) =>
      entry.argumentHint
        ? t('quickActions.commands.argumentHint', { hint: entry.argumentHint })
        : null,
  };
}
