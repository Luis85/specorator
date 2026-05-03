// Fixture: the delete operator is banned project-wide.
// Expected lint failure: no-restricted-syntax (UnaryExpression[operator="delete"]).
export function _appUsesDelete(): void {
	const target: { value?: number } = { value: 1 };
	delete target.value;
}
