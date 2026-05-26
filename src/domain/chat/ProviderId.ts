/**
 * Provider identity (SPEC-CC-006, SPEC-PV-001). Declared as a string union to
 * stay additive. P1 shipped Claude only; P9 (providers-registry, REQ-PV-005)
 * widens the union to the three providers. The widen is purely additive — every
 * P1–P8 `'claude'` use site (the `ChatRuntimePort.providerId`, the
 * `ProviderHistoryPort.providerId`, the `ToolbarCatalogPort.getCatalog`) stays
 * valid; the two new ids merely become assignable (NFR-PV-001, SPEC-PV-027). The
 * default + unknown/disabled fallback is always `'claude'` (SPEC-PV-002/003).
 */
export type ProviderId = 'claude' | 'codex' | 'opencode';
