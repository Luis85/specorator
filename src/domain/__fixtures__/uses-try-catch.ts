// Fixture: domain layer must use tryAsync/trySync, not raw try/catch.
// Expected lint failure: no-restricted-syntax (TryStatement).
export function _domainUsesTryCatch(): void {
	try {
		// noop
	} catch {
		// noop
	}
}
