// Fixture: domain layer must not import the `obsidian` module.
// Expected lint failure: no-restricted-imports.
import 'obsidian';

export const _domainImportsObsidian = true;
