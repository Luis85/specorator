/**
 * Seed data for standalone dev mode.
 * All paths mirror what the FeatureRepository writes to the vault.
 */
export const DEV_FIXTURES: Record<string, string> = {
  'features/dark-mode/_meta.md': `---
id: 11111111-1111-1111-1111-111111111111
title: "Dark mode support"
slug: dark-mode
status: active
currentStep: 3
createdAt: 2025-01-10T09:00:00.000Z
updatedAt: 2025-04-20T14:30:00.000Z
---
`,
  'features/onboarding-flow/_meta.md': `---
id: 22222222-2222-2222-2222-222222222222
title: "Onboarding flow"
slug: onboarding-flow
status: draft
currentStep: 1
createdAt: 2025-03-01T11:00:00.000Z
updatedAt: 2025-03-01T11:00:00.000Z
---
`,
  'features/export-pdf/_meta.md': `---
id: 33333333-3333-3333-3333-333333333333
title: "Export to PDF"
slug: export-pdf
status: archived
currentStep: 11
createdAt: 2024-11-05T08:00:00.000Z
updatedAt: 2025-02-14T16:45:00.000Z
---
`,
}
