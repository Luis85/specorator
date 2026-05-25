import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'bang-bash-output',
	command: 'bang-bash-output-command',
	stdout: 'bang-bash-output-stdout',
	stderr: 'bang-bash-output-stderr',
	exit: 'bang-bash-output-exit',
	notice: 'bang-bash-output-notice',
} as const;

/** PageObject for `BangBashOutput.vue` (SPEC-CP-025). Queries by `data-testid` only (ADR-009). */
export class BangBashOutputPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root));
	}

	commandText(): string {
		return this.wrapper.get(this.byTid(TID.command)).text();
	}

	stdoutText(): string {
		return this.wrapper.get(this.byTid(TID.stdout)).text();
	}

	/**
	 * Count of live `<script>` elements under stdout — used to assert verbatim-text
	 * rendering (EC-CP-13): escaped output parses to zero script elements. Avoids
	 * reading `innerHTML` (lint-forbidden); a tag selector is permitted in tests.
	 */
	stdoutScriptElementCount(): number {
		return this.wrapper.get(this.byTid(TID.stdout)).findAll('script').length;
	}

	hasStderr(): boolean {
		return this.wrapper.find(this.byTid(TID.stderr)).exists();
	}

	stderrText(): string {
		return this.wrapper.get(this.byTid(TID.stderr)).text();
	}

	hasExitBadge(): boolean {
		return this.wrapper.find(this.byTid(TID.exit)).exists();
	}

	exitText(): string {
		return this.wrapper.get(this.byTid(TID.exit)).text();
	}

	hasNotice(): boolean {
		return this.wrapper.find(this.byTid(TID.notice)).exists();
	}

	noticeText(): string {
		return this.wrapper.get(this.byTid(TID.notice)).text();
	}
}
