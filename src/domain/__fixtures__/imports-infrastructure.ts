// Fixture: domain layer must not import infrastructure.
// Expected lint failure: no-restricted-imports.
import '@/infrastructure/bridge/IBridge';

export const _domainImportsInfrastructure = true;
