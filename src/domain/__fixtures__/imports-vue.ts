// Fixture: domain layer must not depend on Vue.
// Expected lint failure: no-restricted-imports.
import 'vue';

export const _domainImportsVue = true;
