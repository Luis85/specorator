import { DOMWrapper } from '@vue/test-utils'

export class ErrorBoundaryPO {
	constructor(private readonly wrapper: { find: (sel: string) => DOMWrapper<Element> }) {}

	fallback(): DOMWrapper<Element> {
		return this.wrapper.find('[data-testid="error-boundary-fallback"]')
	}

	hasFallback(): boolean {
		return this.fallback().exists()
	}
}
