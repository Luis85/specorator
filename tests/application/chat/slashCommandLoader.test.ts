/**
 * Tests for the vault slash-command loader (PR-ASV-3 follow-up). Verifies
 * the frontmatter parser tolerates real-world content (Claudian-style
 * commands and skills) and that bad files are dropped without throwing.
 */
import { describe, it, expect } from 'vitest';

import { loadVaultSlashCommands } from '@/application/chat/slashCommandLoader';
import { fakeModulePorts } from '@/../tests/__fakes__/fake-ports';

function seed(files: Record<string, string>) {
	const ports = fakeModulePorts();
	for (const [path, content] of Object.entries(files)) {
		// Write through the vault port so listFiles + readFile see them.
		void ports.vault.writeFile(path, content);
	}
	return ports;
}

describe('loadVaultSlashCommands', () => {
	it('returns an empty array when neither .claude/commands nor .claude/skills exists', async () => {
		const ports = fakeModulePorts();
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
	});

	it('loads a valid command file with full frontmatter', async () => {
		const ports = seed({
			'.claude/commands/review.md': [
				'---',
				'description: Run a code review on a file.',
				'argument-hint: "[path/to/file]"',
				'allowed-tools: [Read, Bash]',
				'model: opus',
				'context: fork',
				'agent: research',
				'---',
				'',
				'Review this file thoroughly: $ARGUMENTS',
				'',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toHaveLength(1);
		const cmd = result[0];
		expect(cmd.source).toBe('vault-command');
		expect(cmd.id).toBe('commands:review');
		expect(cmd.name).toBe('review');
		expect(cmd.description).toBe('Run a code review on a file.');
		expect(cmd.body).toContain('Review this file thoroughly');
		expect(cmd.argumentHint).toBe('[path/to/file]');
		expect(cmd.allowedTools).toEqual(['Read', 'Bash']);
		expect(cmd.model).toBe('opus');
		expect(cmd.context).toBe('fork');
		expect(cmd.agent).toBe('research');
	});

	it('loads a skill from `.claude/skills/<slug>/SKILL.md` with id `skills:<slug>`', async () => {
		const ports = seed({
			'.claude/skills/publish-release/SKILL.md': [
				'---',
				'description: Walk through a release.',
				'---',
				'',
				'Body of the skill.',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toHaveLength(1);
		expect(result[0].source).toBe('vault-skill');
		expect(result[0].id).toBe('skills:publish-release');
		expect(result[0].name).toBe('publish-release');
		expect(result[0].body).toContain('Body of the skill.');
	});

	it('skips skill folders that do not contain a SKILL.md (logs debug, no warn)', async () => {
		const ports = seed({
			// A sibling file inside the folder but no SKILL.md.
			'.claude/skills/half-baked/notes.md': '---\ndescription: Notes.\n---\n\nBody',
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
		// No warn — missing SKILL.md is a benign skip, not a malformed file.
		expect(ports.logger.warn).not.toHaveBeenCalled();
	});

	it('does not load skills from a flat `.claude/skills/<slug>.md` file', async () => {
		const ports = seed({
			'.claude/skills/legacy-flat.md': '---\ndescription: Legacy flat layout.\n---\n\nBody',
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
	});

	it('loads multiple skills, each from its own folder', async () => {
		const ports = seed({
			'.claude/skills/alpha/SKILL.md': '---\ndescription: Alpha.\n---\n\nAlpha body',
			'.claude/skills/beta/SKILL.md': '---\ndescription: Beta.\n---\n\nBeta body',
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		const ids = result.map((c) => c.id).sort();
		expect(ids).toEqual(['skills:alpha', 'skills:beta']);
	});

	it('skips files with missing description and warns', async () => {
		const ports = seed({
			'.claude/commands/no-desc.md': ['---', 'argument-hint: "[x]"', '---', '', 'Body.'].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
		expect(ports.logger.warn).toHaveBeenCalled();
	});

	it('skips files with malformed frontmatter (no closing fence) and warns', async () => {
		const ports = seed({
			'.claude/commands/bad.md': ['---', 'description: Missing closing fence', '', 'Body.'].join(
				'\n',
			),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
		expect(ports.logger.warn).toHaveBeenCalled();
	});

	it('skips files with user-invocable: false', async () => {
		const ports = seed({
			'.claude/commands/hidden.md': [
				'---',
				'description: Hidden command.',
				'user-invocable: false',
				'---',
				'',
				'Body.',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
	});

	it('skips skills with disable-model-invocation: true', async () => {
		const ports = seed({
			'.claude/skills/disabled/SKILL.md': [
				'---',
				'description: Disabled skill.',
				'disable-model-invocation: true',
				'---',
				'',
				'Body.',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
	});

	it('keeps commands with disable-model-invocation: true (the flag is skill-only)', async () => {
		const ports = seed({
			'.claude/commands/cmd.md': [
				'---',
				'description: Command.',
				'disable-model-invocation: true',
				'---',
				'',
				'Body.',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toHaveLength(1);
		expect(result[0].source).toBe('vault-command');
	});

	it('keeps explicit user-invocable: true', async () => {
		const ports = seed({
			'.claude/commands/explicit.md': [
				'---',
				'description: Explicit.',
				'user-invocable: true',
				'---',
				'',
				'Body.',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toHaveLength(1);
		expect(result[0].userInvocable).toBe(true);
	});

	it('combines commands and skills in one result', async () => {
		const ports = seed({
			'.claude/commands/a.md': '---\ndescription: A.\n---\n\nA body',
			'.claude/skills/b/SKILL.md': '---\ndescription: B.\n---\n\nB body',
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		const ids = result.map((c) => c.id).sort();
		expect(ids).toEqual(['commands:a', 'skills:b']);
	});

	it('does not recurse into subfolders', async () => {
		// Claudian's behaviour: flat scan of `.claude/commands` only. The mock
		// vault's `listFiles` already returns only direct-children entries, so
		// a nested file is naturally invisible to the scan. Verify that
		// behaviour holds end-to-end.
		const ports = seed({
			'.claude/commands/top.md': '---\ndescription: Top.\n---\n\nTop body',
			'.claude/commands/nested/inner.md': '---\ndescription: Nested.\n---\n\nNested body',
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		const names = result.map((c) => c.name);
		expect(names).toContain('top');
		expect(names).not.toContain('inner');
	});

	it('preserves the prompt body verbatim (minus the frontmatter block)', async () => {
		const ports = seed({
			'.claude/commands/wrap.md': [
				'---',
				'description: Wrap.',
				'---',
				'',
				'Line one',
				'Line two',
				'',
				'Line four',
			].join('\n'),
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result[0].body).toBe('Line one\nLine two\n\nLine four');
	});

	it('ignores non-markdown files in the folder', async () => {
		const ports = seed({
			'.claude/commands/keep.md': '---\ndescription: Keep.\n---\n\nBody',
			'.claude/commands/note.txt': 'not a markdown file',
		});
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result.map((c) => c.name)).toEqual(['keep']);
	});

	it('tolerates a vault.listFiles rejection (treated as empty folder)', async () => {
		const ports = fakeModulePorts();
		// Replace listFiles with a rejecting stub for .claude/commands only.
		const originalList = ports.vault.listFiles.bind(ports.vault);
		ports.vault.listFiles = async (folder: string): Promise<string[]> => {
			if (folder === '.claude/commands') {
				throw new Error('boom');
			}
			return originalList(folder);
		};
		const result = await loadVaultSlashCommands(ports.vault, ports.logger);
		expect(result).toEqual([]);
	});
});
