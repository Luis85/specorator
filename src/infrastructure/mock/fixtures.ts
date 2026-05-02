/**
 * Seed data for standalone dev mode.
 * All paths and frontmatter mirror what FeatureRepository writes to the vault
 * (agentic-workflow-compatible schema per ADR-005 / DESIGN-AVS-001).
 */
export const DEV_FIXTURES: Record<string, string> = {
	'specs/dark-mode/workflow-state.md': `---
id: 11111111-1111-1111-1111-111111111111
slug: dark-mode
feature: "Dark mode support"
area: DMS
status: active
currentStep: 3
current_stage: requirements
last_updated: 2025-04-20
last_agent: ""
artifacts:
  idea: complete
  research: complete
  requirements: in-progress
  design: pending
  spec: pending
  tasks: pending
  implementation-log: pending
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
createdAt: 2025-01-10T09:00:00.000Z
updatedAt: 2025-04-20T14:30:00.000Z
---
`,
	'specs/onboarding-flow/workflow-state.md': `---
id: 22222222-2222-2222-2222-222222222222
slug: onboarding-flow
feature: "Onboarding flow"
area: OF
status: draft
currentStep: 1
current_stage: idea
last_updated: 2025-03-01
last_agent: ""
artifacts:
  idea: complete
  research: pending
  requirements: pending
  design: pending
  spec: pending
  tasks: pending
  implementation-log: pending
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
createdAt: 2025-03-01T11:00:00.000Z
updatedAt: 2025-03-01T11:00:00.000Z
---
`,
	'specs/export-pdf/workflow-state.md': `---
id: 33333333-3333-3333-3333-333333333333
slug: export-pdf
feature: "Export to PDF"
area: EP
status: archived
currentStep: 12
current_stage: retrospective
last_updated: 2025-02-14
last_agent: ""
artifacts:
  idea: complete
  research: complete
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
  implementation-log: complete
  test-plan: complete
  test-report: complete
  review: complete
  release-notes: complete
  retrospective: in-progress
createdAt: 2024-11-05T08:00:00.000Z
updatedAt: 2025-02-14T16:45:00.000Z
---
`,
}
