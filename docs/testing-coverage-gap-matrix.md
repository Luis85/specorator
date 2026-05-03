# Test Coverage Gap Matrix

Issue: #120
Date: 2026-05-03

This matrix records the current test architecture gaps before the broader W10 test-conventions work in #108. It intentionally avoids moving existing tests to a mirror layout or adding coverage thresholds; those remain in W10 scope.

| Layer | Current coverage | Gap | Priority | Owner issue |
| --- | --- | --- | --- | --- |
| Domain | `Feature` and `Slug` unit tests cover aggregate state transitions, slug validation, and edge cases. | Continue adding narrow tests when domain behavior changes. | Medium | Ongoing feature PRs |
| Application | `CreateFeatureUseCase`, activation, advancement, and repository-backed persistence paths are covered with `MockBridge`. | Split use case tests by source path during mirror-layout migration. | Medium | #108 |
| Bridge adapters | `MockBridge` and `LocalStorageBridge` had adapter-specific tests, but no shared contract asserting that adapters agree on `IBridge` behavior. | Added shared `IBridge` contract tests for mock and localStorage adapters in this branch. Obsidian adapter still needs a fake Obsidian vault harness before it can join the contract suite. | High | #120, then #108 for harness conventions |
| Repository persistence | `FeatureRepository` is exercised through use cases, including overwrite protection and deletion. | Add direct repository tests for malformed frontmatter variants, custom settings folders, and path edge cases. | High | Follow-up from #108 |
| Pinia stores | No direct Pinia store tests. Store behavior is indirectly covered through components/composables only where present. | Add `createTestingPinia`-backed store tests for feature, notification, and settings stores. | High | #108 |
| Vue components | `CreateFeatureForm` and `FeatureCard` have Vue Test Utils coverage. | Extend interactive component coverage with PageObject examples and `data-testid`-only queries. | Medium | #108 |
| Router/composables | `fileRoute` has focused route utility tests. Composables are not directly covered. | Add composable tests around bridge failures, loading states, and settings persistence. | Medium | #108 |
| Standalone smoke | No end-to-end smoke test exercises a full browser-mode happy path through the standalone bridge. | Add a smoke path that creates a feature, opens its workflow state, and verifies persisted bridge state survives reload. | High | #108 or separate smoke-test issue |
| CI coverage gate | Vitest coverage can be run locally, but CI does not enforce thresholds. | Ratchet and enforce statements 80 / branches 70 / functions 80 / lines 80 when the test layout and fake-port conventions land. | Medium | #108 |

## Scope Decision

#120 should close after this matrix and the first high-value bridge contract layer land. The remaining store, component PageObject, smoke, fake-port, mirror-layout, and coverage-threshold work should be absorbed by W10 (#108), because that issue already defines the conventions needed to keep those tests consistent.
