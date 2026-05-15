/**
 * T-ASM-068 — PageObject for FileWriteProposalCard.
 *
 * Queries by `data-testid` exclusively per ADR-009.
 */
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'

export class FileWriteProposalCardPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`
	}

	get cardEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card'))
	}

	get headingEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-heading'))
	}

	get pathEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-path'))
	}

	get contentPreviewEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-content-preview'))
	}

	get showMoreEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-show-more'))
	}

	get acceptEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-accept'))
	}

	get rejectEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-reject'))
	}

	get retryEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-retry'))
	}

	get acceptedBodyEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-accepted-body'))
	}

	get rejectedBodyEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-rejected-body'))
	}

	get failedBodyEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-failed-body'))
	}

	get pathInvalidEl(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('proposal-card-path-invalid'))
	}

	hasCard(): boolean {
		return this.cardEl.exists()
	}

	hasHeading(): boolean {
		return this.headingEl.exists()
	}

	hasPath(): boolean {
		return this.pathEl.exists()
	}

	hasContentPreview(): boolean {
		return this.contentPreviewEl.exists()
	}

	hasShowMore(): boolean {
		return this.showMoreEl.exists()
	}

	hasAccept(): boolean {
		return this.acceptEl.exists()
	}

	hasReject(): boolean {
		return this.rejectEl.exists()
	}

	hasRetry(): boolean {
		return this.retryEl.exists()
	}

	hasAcceptedBody(): boolean {
		return this.acceptedBodyEl.exists()
	}

	hasRejectedBody(): boolean {
		return this.rejectedBodyEl.exists()
	}

	hasFailedBody(): boolean {
		return this.failedBodyEl.exists()
	}

	hasPathInvalid(): boolean {
		return this.pathInvalidEl.exists()
	}

	pathText(): string {
		return this.pathEl.text()
	}

	contentPreviewText(): string {
		return this.contentPreviewEl.text()
	}

	cardRole(): string | undefined {
		return this.cardEl.attributes('role')
	}

	cardAriaLabel(): string | undefined {
		return this.cardEl.attributes('aria-label')
	}

	headingTabindex(): string | undefined {
		return this.headingEl.attributes('tabindex')
	}

	acceptAriaLabel(): string | undefined {
		return this.acceptEl.attributes('aria-label')
	}

	rejectAriaLabel(): string | undefined {
		return this.rejectEl.attributes('aria-label')
	}

	retryAriaLabel(): string | undefined {
		return this.retryEl.attributes('aria-label')
	}

	async clickAccept(): Promise<void> {
		await this.acceptEl.trigger('click')
	}

	async clickReject(): Promise<void> {
		await this.rejectEl.trigger('click')
	}

	async clickRetry(): Promise<void> {
		await this.retryEl.trigger('click')
	}

	async clickShowMore(): Promise<void> {
		await this.showMoreEl.trigger('click')
	}

	async pressKeyOnAccept(key: string): Promise<void> {
		await this.acceptEl.trigger('keydown', { key })
	}

	async pressKeyOnReject(key: string): Promise<void> {
		await this.rejectEl.trigger('keydown', { key })
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}

	allTestIdsInTabOrder(): string[] {
		// Returns interactive elements that participate in the natural tab order,
		// in document order (default Tab traversal).
		const interactive = this.cardEl.element.querySelectorAll<HTMLElement>(
			'button, [tabindex]',
		)
		const out: string[] = []
		for (const el of Array.from(interactive)) {
			const testId = el.getAttribute('data-testid')
			if (testId !== null) out.push(testId)
		}
		return out
	}
}
