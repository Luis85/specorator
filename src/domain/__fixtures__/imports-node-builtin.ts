// Fixture: domain layer must not depend on Node built-ins.
// Expected lint failure: no-restricted-imports.
import 'node:path';

export const _domainImportsNode = true;
