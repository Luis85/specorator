// Fixture: domain layer must not import infrastructure.
// Expected lint failure: no-restricted-imports.
import '@/infrastructure/bridge/ports';

export const _domainImportsInfrastructure = true;
