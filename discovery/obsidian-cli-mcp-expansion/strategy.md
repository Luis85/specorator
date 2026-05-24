# Strategy — Obsidian CLI MCP Expansion

Owner: product-strategist | Date: 2026-05-24 | Phase: Discovery / Frame

---

## 1. Lean Canvas

| Block | Content |
|---|---|
| **Problem** | (1) Agents working in Obsidian vaults can read but barely *act* — most MCP servers stop at search/read or expose a generic `execute` shell. (2) Spec-driven workflows need agents to manipulate frontmatter, properties, canvases, daily notes, and the web viewer — not just markdown text. (3) Granting broad CLI access without governance terrifies vault owners (TBD — assumption; validate with user-researcher). |
| **Customer segments** | Primary: solo knowledge workers and indie devs running Claude/Codex against an Obsidian vault that holds *both* notes and `specs/`. Secondary: small AI-native teams adopting spec-first workflows. Tertiary (later): plugin developers wanting a governed automation substrate. |
| **UVP** | "The only Obsidian MCP that gives your agent the *full* official CLI surface, gated by a per-tool proposal-and-approval contract — so the agent can act like a teammate without acting like a vandal." |
| **Solution** | Wrap the official Obsidian CLI (~120 commands) as discoverable MCP tools; group by capability (vault, frontmatter, canvas, daily notes, web, plugin lifecycle); reuse the existing proposal-gate pattern for any write/mutating command; ship a capability manifest the agent can introspect. |
| **Unfair advantage** | (a) Built atop the *official* CLI — competitors reverse-engineer or wrap REST; we inherit Obsidian's own compatibility contract. (b) Specorator already owns the spec-first workflow context the agent reasons over — the MCP isn't a generic tool, it's wired to a method. (c) `web url=…` lets the agent fetch + render web content *inside* the vault, which none of the three competitors expose. |
| **Channels** | Obsidian community-plugin marketplace (primary discovery), Claude Code plugin marketplace, agentic-workflow GitHub, r/ObsidianMD, r/ClaudeAI, "Obsidian + AI" YouTube niche. |
| **Revenue** | Free / OSS plugin. Rationale: distribution >> monetisation at this stage; the moat is workflow lock-in and CLI-coverage parity, not licence fees. Re-evaluate at >5k installs. |
| **Cost structure** | Maintainer time tracking upstream CLI releases; CI minutes for cross-platform CLI shimming; documentation. No infra cost (loopback HTTP, in-process). |
| **Key metrics** | Tools-per-session actually invoked; proposal-approval ratio; % of `specs/<slug>/` lifecycles completed without falling back to manual edits. |
| **Riskiest assumption** | That users will trust a proposal-gated broad surface *more* than a narrow one. If they instead demand "no writes ever," the expansion strategy collapses. → flag for user-researcher validation. |

## 2. Jobs to be Done

1. When I'm mid-spec and the agent needs context from a linked daily note, I want it to open and read that note without my having to paste it, so I can keep flow.
2. When I approve a design decision in chat, I want the agent to update the frontmatter `stage:` and `decided_at:` fields on the right file, so the workflow-state stays canonical.
3. When the agent proposes a new feature spec, I want it to scaffold the `specs/<slug>/` folder, canvas, and stage stubs in one approved batch, so I don't manually run 10 commands.
4. When researching, I want the agent to fetch a URL into the web viewer and quote it into my research note with provenance, so citations are traceable without leaving the vault.
5. When a community plugin I depend on is missing, I want the agent to detect it and propose enabling/installing it, so onboarding a fresh vault is one approval, not a checklist.
6. When I review yesterday's work, I want the agent to traverse the wikilink graph from today's daily note and summarise touched specs, so my standup writes itself.

## 3. North Star Metric — candidates

| Option | Definition | Pros | Cons |
|---|---|---|---|
| A. Weekly Approved Tool Invocations per Active Vault | Count of agent tool calls user approved (write/mutating) | Leading, actionable, ties to *value delivered through action* | Could incentivise chatty agents |
| B. Spec Lifecycles Completed Agent-Assisted per Week | `workflow-state.md` reaching stage 11 with >=N approved tool calls along the way | Measures end-to-end methodology success | Long cycle time; lagging |
| C. Proposal Approval Rate (rolling 30d) | Approved / (approved + rejected) proposals | Pure trust signal | Goodhart-prone; agent learns to under-propose |

**Pick: A — Weekly Approved Tool Invocations per Active Vault.** Leading, observable in-product, directly reflects whether the expanded surface is *used* (not just shipped), and pairs naturally with a guardrail metric (approval rate >= 70%). Current: TBD — owner: user-researcher to instrument. Target (90 days post-expansion): 25/vault/week.

## 4. Opportunity Solution Tree (top of tree only)

**Outcome:** Increase Weekly Approved Tool Invocations per Active Vault to 25.

- **Opportunity O1 — "The agent can read but can't finish the task."**
  - S1.1 Expose write/append/replace at section + property level → CLI: `frontmatter set`, `note append`, `note replace`
  - S1.2 Expose canvas mutation for design stage → CLI: `canvas add-node`, `canvas link`
  - S1.3 Daily-note rollups → CLI: `daily open`, `daily append`
  - S1.4 Batch proposals (one approval, N commands)

- **Opportunity O2 — "I don't trust giving an agent shell-equivalent power over my vault."**
  - S2.1 Capability manifest the user reviews at install → CLI: introspection via `--help` parsing
  - S2.2 Per-tool risk tier (read / mutate-scoped / mutate-broad / lifecycle) with separate approval UX
  - S2.3 Dry-run mode rendering the diff before approval → CLI: `--dry-run` flags
  - S2.4 Per-folder allowlist (e.g. `specs/**` writable, rest read-only)

- **Opportunity O3 — "I leave Obsidian to research, then lose the trail."**
  - S3.1 In-vault web fetch with provenance → CLI: `web url=…` (unique vs. competitors)
  - S3.2 Auto-quote with backlink to source note
  - S3.3 Saved-search tools → CLI: `search`, `search saved`
  - S3.4 Plugin-lifecycle detection so missing readers (e.g. Dataview) self-heal → CLI: `plugin enable`

## 5. Positioning statement

For solo knowledge workers and small AI-native teams running Claude or Codex against an Obsidian vault that holds both their notes and their `specs/`, who need an agent that can actually *finish* a spec-driven task without manual copy-paste, **Specorator** is an **Obsidian-native agent workbench** that exposes the full official Obsidian CLI as governed, proposal-gated MCP tools wired to a spec-first methodology — unlike `cli-rest-mcp` (two generic tools, no methodology), `aaronsb/obsidian-mcp-plugin` (rich read surface, no write governance), and `ebullient/obsidian-vault-mcp` (read-only) which leave the agent either underpowered or ungoverned.

---

## Sources

- North Star Framework — Sean Ellis: https://growthmethod.com/the-north-star-metric/
- Jobs to be Done — Strategyn: https://strategyn.com/jobs-to-be-done/
- Opportunity Solution Tree — Teresa Torres: https://www.producttalk.org/opportunity-solution-trees/
- Lean Canvas — Ash Maurya: https://leancanvas.com/
- Obsidian CLI: https://obsidian.md/cli
- Competitor surfaces named in brief (cli-rest-mcp, aaronsb/obsidian-mcp-plugin, ebullient/obsidian-vault-mcp) — sourced from user brief; not independently verified.

## Open assumptions (for user-researcher)

- A1 Users prefer broad-surface-with-governance over narrow-surface-no-governance. (Riskiest.)
- A2 Approval fatigue does not collapse trust at >30 prompts/week.
- A3 `web url=…` as a differentiator matters to the target segment (vs. them using a separate browser).
- A4 Current install base is large enough to ship a behaviour-changing release without a kill-switch.
