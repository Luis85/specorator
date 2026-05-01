# Specorator

Specorator is an Obsidian-centered workflow product for spec-driven, agentic software development.

The long-term product direction is captured in [docs/product-vision.md](docs/product-vision.md). The core idea: users should be able to run, inspect, and maintain the full workflow from an approachable interface, while the underlying vault quality tooling remains usable without requiring an LLM integration.

## Intake-first planning

The repository includes GitHub issue templates for design and requirement intake, plus a draft PR workflow for frontmatter-based requirement files.

- Start with `.github/ISSUE_TEMPLATE/02-requirement-intake.yml` for new requirements.
- Add requirement drafts under `requirements/intake/` using `REQ-0000-template.md`.
- Follow `docs/process/requirements-intake.md` for triage and promotion.
