# WP-9 — Security hardening pass

**Branch:** `claude/asv3-wp09-security-hardening` (cut from `origin/develop`)
**Lane:** Security (independent — no inter-WP dependency)
**Estimated size:** medium-large (~300–500 LOC across secret-store hardening, subprocess argv guards, link-handling audit, ESLint rule extension; small per-file edits over a broad surface)

## Goal (one sentence)

Close the four concrete security gaps identified by walking the v2 attack surface — secret-store low-coverage and silent-failure, subprocess argv guard depth, the rendered-markdown link surface, and the `Vault.adapter.append` / vault-write trust-first invariants — without expanding scope into anything WP-4 (markdown) or WP-13 (test catch-up) already owns.

## Problem statement

A focused security review of the v2 surface produced four concrete punch-list items, none of them speculative:

1. **Secret-store silently no-ops on the wrong key id.** `src/domain/ports/SecretStorePort.ts:33–44` notes that Obsidian's `App.secretStorage` validates IDs against lowercase-alphanumeric + dashes — and that a previous dot-delimited / camelCase id was silently rejected. The current canonical id `SECRET_ID_ANTHROPIC = 'specorator-anthropic-apikey'` (line 44) is correct, BUT the contract on `setSecret` (line 32) says "Implementations MUST NOT throw on the unavailable path" — and that's also how the LocalStorage adapter behaves. There is no test today that asserts the canonical id passes Obsidian's validator AND no test that asserts `setSecret` writes are observable via a subsequent `getSecret` on each adapter. The audit's 0%-coverage entry for `LocalStorageSecretStore` and 58% for `MockSecretStore` is the symptom; the silent-no-op invariant is the cause.
2. **Subprocess argv has structural guards but no runtime invariant assertion.** `src/infrastructure/obsidian/buildSubprocessArgs.ts` (85 LOC, pure) enforces INV-1…INV-6 by construction. But `ClaudeSubprocessAdapter.queryStream` and `runSubprocessStructured` pass the argv result of `buildSubprocessArgs` to `SubprocessLifecycle.spawn(binaryPath, argv, …)` and then `spawn(binaryPath, argv, { stdio: [...] })`. If `binaryPath` is ever user-controlled (e.g. a future feature that lets users point at a custom CLI), we want a defense-in-depth check that the resolved binary path is absolute, not relative, and matches the `claude-code` family — not a shell command. Today `ClaudeBinaryResolver` (194 LOC) handles platform discovery; there's no centralised "is this path safe to spawn" assertion shared between the streaming and structured paths. Add `assertSpawnable(binaryPath)` next to the resolver and call it from both `queryStream` and `runSubprocessStructured` before `lifecycle.spawn`.
3. **Vault link surface beyond `MarkdownBlock` is not audited.** `MarkdownBlock.vue`'s `safeHref` is hardened by WP-4 (parallel WP). But the agent-sidepanel surface includes other places that might compose URLs: `FileWriteProposalCard.vue` (writes a path preview), `ContextFileChip.vue`, `ChatInput.vue` (mention dropdown paths). Each must be confirmed to NOT pass user-controlled strings to `window.open`, `.href = …`, or any anchor with an attacker-controllable URL. The lint rules already ban `innerHTML` / `v-html` / `insertAdjacentHTML`. This WP adds a co-located audit + a `no-restricted-syntax` ESLint rule that catches `<a :href="userVar">` patterns without a `safeHref`-wrapped value.
4. **Trust-first vault-write invariants need an ESLint pin.** ADR-0031 / NFR-ASM-004 say "never read anything under `~/.claude/`". A `local/no-claude-home-reads` rule exists (per `graphify-out/GRAPH_REPORT.md` Community 38). Verify it covers the new files added in v3 (subprocess split, session-log writer, etc.) and extend the rule's regex to also catch `node:fs` reads pointed at `os.homedir() + '.claude'` or the literal `~/.claude` — not just imports of `fs` itself. Same rule should ban writes outside the vault root (any `node:fs.writeFile`).

## Scope — IN

**Secret-store hardening (gap 1):**

- Add `tests/infrastructure/localstorage/LocalStorageSecretStore.test.ts` — close the 0% coverage gap. Assert `available === false`, `getSecret` returns `null`, `setSecret` is a no-op (no throw).
- Raise `tests/infrastructure/mock/MockSecretStore.test.ts` to ≥ 95% statements. Assert round-trip persistence: `setSecret(id, v)` then `getSecret(id)` returns `v`.
- Add a regex assertion to `SECRET_ID_ANTHROPIC` (compile-time test): `expect(SECRET_ID_ANTHROPIC).toMatch(/^[a-z0-9-]+$/)`. Documents the Obsidian validator constraint.
- `MockSecretStore` and `LocalStorageSecretStore` MUST NOT log secret values. Verify via a `logger.calls` recorder that no log message contains a `secret` value during set/get.

**Subprocess argv depth (gap 2):**

- Add `src/infrastructure/obsidian/assertSpawnable.ts` — pure module with `assertSpawnable(binaryPath: string): Result<void, SpawnGuardError>`. Validates: absolute path, not `/bin/sh` / `/bin/bash` / `cmd.exe` / `powershell.exe`, basename matches `^claude(-code)?(\\.exe|\\.cmd)?$`.
- Call from `ClaudeSubprocessAdapter.queryStream` (path: SDK or NDJSON) and `runSubprocessStructured`, BEFORE `lifecycle.spawn`. On guard failure, surface as `ClaudeCliError` with code `SPAWN_GUARD_FAILED`.
- Mirror test `tests/infrastructure/obsidian/assertSpawnable.test.ts` with the rejection table.

**Link-surface audit (gap 3):**

- Manual sweep of every `.vue` file under `src/ui/components/{agent,chat}/`. For each `<a href=…>` / `:href=…` / `window.open(…)` / `.location.href = …`, document in `loop-state.md` whether the URL value is (a) a constant, (b) a `safeHref`-wrapped string, or (c) directly user-controlled. Fix any (c) by routing through the WP-4 `safeHref` module.
- Add ESLint rule `local/no-unsafe-anchor-href` in `eslint.config.js` flagging `<a :href="…">` patterns whose source isn't a `safeHref(…)` call. Enforce at warn severity initially — accept that the first run may flag false positives that the maintainer reviews. (Promote to error once the audit clears.)

**Vault-write invariants (gap 4):**

- Verify `local/no-claude-home-reads` covers the new files added since WP-1 (SubprocessLifecycle, NdjsonChannel, runSubprocessStructured, SessionLogWriter additions). Extend its regex to catch:
  - `homedir() + '/.claude'`
  - `path.join(os.homedir(), '.claude'`
  - String literal `'~/.claude'`
  - `fs.appendFile(…)` / `fs.writeFile(…)` / `fs.readFile(…)` outside `src/infrastructure/obsidian/ClaudeBinaryResolver.ts` (which legitimately reads from outside the vault to discover the binary).
- Add `tests/eslint/no-claude-home-reads.test.ts` with positive + negative fixtures.

## Scope — OUT

- `MarkdownBlock.vue` `safeHref` itself — that's WP-4.
- Subprocess lifecycle / NDJSON channel split — that's WP-11 (already merged).
- Secret-store SCHEMA changes (no new ids, no new methods on the port).
- A11y / Stop / Esc-aborts — WP-7 (already merged).
- Adding new lint rule infrastructure beyond extending what's already in `eslint.config.js` (the rules registry is fine; just add one new entry).
- Supply-chain audit (`npm audit`, dependency review) — that's the `verify` job's existing scope; no changes here.

## Approach

1. **Iteration 1 — secret-store coverage.** Write the two new test files. Land the round-trip assertion + the id-format compile-time test. Expect coverage to jump from 0%/58% to ≥ 95% for both adapters.
2. **Iteration 2 — `assertSpawnable`.** Pure module + tests + wire it into both subprocess entry points.
3. **Iteration 3 — link-surface audit.** Walk each Vue file under `src/ui/components/{agent,chat}/`; document in `loop-state.md`; fix any unsafe instances.
4. **Iteration 4 — `local/no-unsafe-anchor-href` ESLint rule** + its tests. Add to `eslint.config.js`.
5. **Iteration 5 — vault-write rule extension.** Extend `local/no-claude-home-reads` regex; add positive/negative test fixtures.
6. **Run the full pre-PR gate every iteration.**

## Deliverables

**New files:**

- `src/infrastructure/obsidian/assertSpawnable.ts` + tests.
- `tests/infrastructure/localstorage/LocalStorageSecretStore.test.ts`.
- ESLint rule source: `eslint-rules/no-unsafe-anchor-href.js` (or wherever the existing project rules live — confirm location via the existing `no-claude-home-reads` rule).
- `tests/eslint/no-unsafe-anchor-href.test.ts`.
- `tests/eslint/no-claude-home-reads.test.ts` (or extend existing).

**Modified files:**

- `src/infrastructure/mock/MockSecretStore.ts` — coverage gaps filled by tests; logger-call assertions may require a small refactor of any debug-log statements that include the secret value (verify none today).
- `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` — call `assertSpawnable` before `lifecycle.spawn` in both code paths.
- `eslint.config.js` — wire the two rule entries.
- Any `.vue` files surfaced by the iteration-3 audit whose link surface needs `safeHref` wrapping.

**Deleted (no back-compat shims, per CLAUDE.md):**

- None expected. This WP is additive.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors (warnings from the new rule, if any, recorded in `loop-state.md` for follow-up).
- [ ] `npm run test` passes; secret-store coverage ≥ 95% statements for both `LocalStorageSecretStore` and `MockSecretStore`; new `assertSpawnable` test ≥ 95%.
- [ ] `npm run build` + `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds maintained or improved.
- [ ] **Gap 1 closed**: round-trip `setSecret` → `getSecret` test passes; logger-call recorder asserts no secret value in any log message; canonical id matches `/^[a-z0-9-]+$/`.
- [ ] **Gap 2 closed**: `assertSpawnable` rejects relative paths, `/bin/sh`, `cmd.exe`, `powershell.exe`; both subprocess entry points call it; `SPAWN_GUARD_FAILED` surfaces as a `ClaudeCliError`.
- [ ] **Gap 3 closed**: `loop-state.md` carries the per-file link audit; `no-unsafe-anchor-href` is wired and the lint output is clean for the in-scope files.
- [ ] **Gap 4 closed**: `no-claude-home-reads` covers `os.homedir() + '/.claude'`, `'~/.claude'` literal, and `node:fs.writeFile` outside `ClaudeBinaryResolver.ts`; positive + negative test fixtures pass.
- [ ] PR opened against `develop`, title `chore(asv3): security hardening pass (WP-9)`, body cites each gap as a separate bullet.

## Risks / known unknowns

The Obsidian `App.secretStorage` runtime is mockable but not testable end-to-end without the real Electron app. The round-trip test runs against `MockSecretStore`; the production Obsidian adapter (`ObsidianSecretStoreAdapter`) gets a smoke test that asserts the id validator returns `true` for `SECRET_ID_ANTHROPIC`. The `assertSpawnable` rejection table is opinionated — if a future feature legitimately needs `npx claude` (which would pass `npx` as `binaryPath`), this rule has to be revisited. Mark that as a deliberate future-feature gate, not a regression. The link-surface audit may find zero violations, in which case the `no-unsafe-anchor-href` rule is preventive only — still ship the rule.

## RALPH iteration template

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no markdown/safeHref logic (WP-4), no subprocess split (WP-11),
     no a11y changes (WP-7), no test-catchup (WP-13).
  4. Run from inside .worktrees/asv3-wp09:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via gh.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `.worktrees/asv3-wp09` (already created, branch `claude/asv3-wp09-security-hardening`).
- **Commits:** conventional, squash on merge. Prefix `chore(asv3):` (security hardening is not user-facing functional change).
- **PR target:** `develop`. Ready for review.
- **Do not touch:** `MarkdownBlock.vue` `safeHref` (WP-4 owns), subprocess lifecycle/channel (WP-11 merged), session-log mutex (WP-5 parallel).
- **Coordinate with WP-4** (markdown). Both touch `safeHref` — but WP-4 lives in the `MarkdownBlock` parser, WP-9 lives in the `no-unsafe-anchor-href` ESLint rule that applies to OTHER Vue files. If WP-4 lands first, the rule should NOT flag `MarkdownBlock.vue` (it consumes `safeHref` correctly). Whoever lands second rebases mechanically.
- **Never** push to `develop`. Never force-push.
