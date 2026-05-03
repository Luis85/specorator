// Fixture: UI layer may only reach into `@/infrastructure/bridge/**`.
// Expected lint failure: no-restricted-imports.
import '@/infrastructure/mock/MockBridge';

export const _uiImportsMockBridge = true;
