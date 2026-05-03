// Fixture: application layer must use tryAsync/trySync, not raw try/catch.
// Expected lint failure: no-restricted-syntax (TryStatement).
export function _applicationUsesTryCatch(): void {
	try {
		// noop
	} catch {
		// noop
	}
}
