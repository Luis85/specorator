# Team Chat — Phase 1: Persona/Voice + Emoji Avatars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every roster agent a distinct identity — a freeform "voice/personality" directive that shapes how it speaks, plus an emoji avatar — surfaced everywhere agents already render (the chat "Chatting with X" chip, the Library, the Agent Board), as the first independently-shippable slice of Team Chat.

**Architecture:** Extend the existing roster/persona seam only — no new subsystems. Add `voice` + `avatarEmoji` to `RosterAgent`; thread `voice` through the already-used `formatBoundAgentPersona` directive (the bound-agent path spreads `{...agent}` into it, so no call-site change); map `avatarEmoji` into `AgentPersona`; give `renderAgentAvatar` an emoji branch. Extend the detail editor with the two fields, the dirty-tracker to notice them, and i18n with the labels.

**Tech Stack:** TypeScript, Obsidian API (`createEl`/`setIcon`), Jest (jsdom), typed i18n (key union + locale JSON), modular CSS.

**Scope note:** `avatarImage` (vault-image avatars) from the spec is **deferred** to a later phase — this phase ships `voice` + `avatarEmoji` only, delivering the "voice + richer avatars" value without the resource-path / `app`-threading complexity of image rendering. Precedence in this phase is therefore `emoji → icon → initials → cpu`; a later phase slots `image` in front.

---

## File Structure

**Modified (source):**
- `src/features/agents/roster/rosterTypes.ts` — add `voice?`, `avatarEmoji?` to `RosterAgent`.
- `src/features/agents/agentTypes.ts` — add `emoji?` to `AgentPersona`.
- `src/features/agents/roster/boundAgentPersona.ts` — `voice?` on `BoundAgentPersonaInput`; emit a voice block.
- `src/features/agents/personaRegistry.ts` — map `avatarEmoji → emoji` in `rosterAgentToPersona`.
- `src/features/agents/agentAvatar.ts` — emoji branch in `renderAgentAvatar`.
- `src/features/agents/roster/rosterDirty.ts` — add `voice`, `avatarEmoji` to `SCALAR_KEYS`.
- `src/features/agents/roster/view/AgentDetailEditor.ts` — emoji input in the appearance row + a voice textarea.
- `src/i18n/types/agents.ts` — add three keys to the union.
- `src/i18n/locales/*.json` (×10: en, de, es, fr, ja, ko, pt, ru, zh-CN, zh-TW) — add the three strings.
- `src/style/features/agent-roster.css` — `.specorator-agent-avatar--emoji` rule.

**Modified (tests):**
- `tests/unit/features/agents/roster/boundAgentPersona.test.ts`
- `tests/unit/features/agents/personaRegistry.test.ts`
- `tests/unit/features/agents/agentAvatar.test.ts`
- `tests/unit/features/agents/roster/rosterDirty.test.ts`
- `tests/unit/features/agents/roster/view/AgentDetailEditor.test.ts`

**Verified unchanged (no edit needed):**
- `AgentRosterStore` — persists whole-agent JSON, so new fields round-trip automatically.
- `rosterCapabilities.ts` `cloneRosterAgent` / `createRosterAgent` — clone spreads `{...agent}` (carries the new fields); create omits them (optional → `undefined`).
- `RosterAgentService.resolveBoundAgent` — calls `formatBoundAgentPersona({ ...agent, skills })`, so `voice` threads through with no change.

---

## Task 1: Extend the data-model types

**Files:**
- Modify: `src/features/agents/roster/rosterTypes.ts:23`
- Modify: `src/features/agents/agentTypes.ts:21`

- [ ] **Step 1: Add the roster fields**

In `src/features/agents/roster/rosterTypes.ts`, insert immediately after the `icon?: string;` line (line 23), before the `catalog?:` comment:

```typescript
  /**
   * Freeform voice/tone directive shaping how the agent speaks, distinct from the
   * task `prompt`. Injected into the bound-agent persona directive.
   */
  voice?: string;
  /** Emoji avatar glyph; takes precedence over icon/initials when set. */
  avatarEmoji?: string;
```

- [ ] **Step 2: Add the persona field**

In `src/features/agents/agentTypes.ts`, insert immediately after the `icon?: string;` line (line 21), before the `builtin?` line:

```typescript
  /** Emoji glyph; takes precedence over icon/initials for non-builtin personas. */
  emoji?: string;
```

- [ ] **Step 3: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: PASS (optional fields, no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add src/features/agents/roster/rosterTypes.ts src/features/agents/agentTypes.ts
git commit -m "feat(agents): add voice + avatarEmoji to RosterAgent and emoji to AgentPersona"
```

---

## Task 2: Add i18n keys for the editor labels

**Files:**
- Modify: `src/i18n/types/agents.ts`
- Modify: `src/i18n/locales/en.json` (+ `de`, `es`, `fr`, `ja`, `ko`, `pt`, `ru`, `zh-CN`, `zh-TW`)

- [ ] **Step 1: Add the keys to the union type**

In `src/i18n/types/agents.ts`, add three entries to the `agentRoster.*` key union (next to the existing `'agentRoster.icon'` / `'agentRoster.iconNone'`):

```typescript
  | 'agentRoster.emoji'
  | 'agentRoster.voice'
  | 'agentRoster.voicePlaceholder'
```

- [ ] **Step 2: Add the strings to every locale's `agentRoster` object**

In each of the 10 files under `src/i18n/locales/`, add these three keys inside the `"agentRoster"` object (next to `"icon"`/`"iconNone"`). Use the English seed values in every locale (translators refine later; the parity test only checks key presence):

```json
      "emoji": "Emoji",
      "voice": "Voice / personality",
      "voicePlaceholder": "e.g. Warm, concise mentor; explains with analogies",
```

- [ ] **Step 3: Verify typecheck + locale parity**

Run: `npm run typecheck && npm run test -- --selectProjects unit -t "i18n"`
Expected: PASS. If a locale-parity test names a file missing a key, add the key there and re-run. (If no i18n parity test exists, `npm run typecheck` alone gates the union; run `npm run test -- --selectProjects unit` to be safe.)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/types/agents.ts src/i18n/locales/
git commit -m "i18n(agents): add emoji + voice editor labels across locales"
```

---

## Task 3: Inject the voice directive in `formatBoundAgentPersona`

**Files:**
- Test: `tests/unit/features/agents/roster/boundAgentPersona.test.ts`
- Modify: `src/features/agents/roster/boundAgentPersona.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the top-level `describe('formatBoundAgentPersona', ...)` block in `tests/unit/features/agents/roster/boundAgentPersona.test.ts`:

```typescript
  it('injects a voice block after the identity and before the prompt', () => {
    const text = formatBoundAgentPersona({
      name: 'Mentor',
      voice: 'Warm and concise',
      prompt: 'Explain clearly.',
    });
    expect(text).toContain('Voice and manner: Warm and concise');
    expect(text.indexOf('You are Mentor')).toBeLessThan(text.indexOf('Voice and manner'));
    expect(text.indexOf('Voice and manner')).toBeLessThan(text.indexOf('Explain clearly'));
  });

  it('omits the voice block when voice is absent or whitespace', () => {
    expect(formatBoundAgentPersona({ name: 'Mentor' })).not.toContain('Voice and manner');
    expect(formatBoundAgentPersona({ name: 'Mentor', voice: '   ' })).not.toContain('Voice and manner');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/features/agents/roster/boundAgentPersona.test.ts -t "voice"`
Expected: FAIL (no `Voice and manner` text; `voice` not read).

- [ ] **Step 3: Implement**

In `src/features/agents/roster/boundAgentPersona.ts`:

Add `voice?: string;` to the `BoundAgentPersonaInput` interface:

```typescript
export interface BoundAgentPersonaInput {
  name: string;
  description?: string;
  prompt?: string;
  voice?: string;
  skills?: BoundAgentSkill[];
}
```

In `formatBoundAgentPersona`, read `voice` alongside the others and push a block right after the identity block:

```typescript
  const name = agent.name?.trim();
  const description = agent.description?.trim();
  const prompt = agent.prompt?.trim();
  const voice = agent.voice?.trim();

  const blocks: string[] = [];
  if (name) {
    const identity = description ? `${name} — ${description}` : name;
    blocks.push(
      `You are ${identity}. Adopt this identity, role, and voice for the entire `
      + `conversation. This overrides any default assistant identity or model name: `
      + `when asked who or what you are, answer as ${name}.`,
    );
  }
  if (voice) {
    blocks.push(`Voice and manner: ${voice}`);
  }
  if (prompt) {
    blocks.push(prompt);
  }
```

(Leave the skills block and `return blocks.join('\n\n')` unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/features/agents/roster/boundAgentPersona.test.ts`
Expected: PASS (new + existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/roster/boundAgentPersona.ts tests/unit/features/agents/roster/boundAgentPersona.test.ts
git commit -m "feat(agents): inject the agent voice directive into the bound-agent persona"
```

---

## Task 4: Map `avatarEmoji` into the persona

**Files:**
- Test: `tests/unit/features/agents/personaRegistry.test.ts`
- Modify: `src/features/agents/personaRegistry.ts`

- [ ] **Step 1: Write the failing tests**

Add inside `describe('rosterAgentToPersona', ...)` in `tests/unit/features/agents/personaRegistry.test.ts`:

```typescript
    it('maps the agent avatarEmoji onto the persona emoji', () => {
      const agent = { ...createRosterAgent('Researcher', 1), avatarEmoji: '🔬' };
      expect(rosterAgentToPersona(agent).emoji).toBe('🔬');
    });

    it('leaves persona emoji undefined when the agent has none', () => {
      expect(rosterAgentToPersona(createRosterAgent('Plain', 1)).emoji).toBeUndefined();
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/features/agents/personaRegistry.test.ts -t "emoji"`
Expected: FAIL (`persona.emoji` is `undefined` for the emoji agent).

- [ ] **Step 3: Implement**

In `src/features/agents/personaRegistry.ts`, add the `emoji` field to the object returned by `rosterAgentToPersona`:

```typescript
  return {
    id: agent.id,
    name: agent.name,
    color: agent.color || 'var(--color-base-70)',
    initials: agent.initials?.trim() || derived || 'AG',
    icon: agent.icon,
    emoji: agent.avatarEmoji?.trim() || undefined,
    builtin: false,
  };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/features/agents/personaRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/personaRegistry.ts tests/unit/features/agents/personaRegistry.test.ts
git commit -m "feat(agents): project agent avatarEmoji onto the persona"
```

---

## Task 5: Render the emoji avatar (precedence + CSS)

**Files:**
- Test: `tests/unit/features/agents/agentAvatar.test.ts`
- Modify: `src/features/agents/agentAvatar.ts`
- Modify: `src/style/features/agent-roster.css`

- [ ] **Step 1: Write the failing tests**

Add inside `describe('renderAgentAvatar', ...)` in `tests/unit/features/agents/agentAvatar.test.ts`:

```typescript
  it('renders a non-builtin persona emoji as text, taking precedence over icon + initials', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'sci', name: 'Scientist', color: 'var(--color-cyan)',
      initials: 'SC', icon: 'flask-conical', emoji: '🔬',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.classList.contains('specorator-agent-avatar--emoji')).toBe(true);
    expect(avatar.textContent).toBe('🔬');
    expect(avatar.getAttribute('data-icon')).toBeNull();
    expect(avatar.classList.contains('specorator-agent-avatar--initials')).toBe(false);
  });

  it('ignores emoji for the built-in persona (cpu still wins)', () => {
    const host = document.createElement('div');
    const persona: AgentPersona = {
      id: 'standard', name: 'Standard', color: 'var(--color-base-90)', builtin: true, emoji: '🤖',
    };
    const avatar = renderAgentAvatar(host, persona, 20);
    expect(avatar.getAttribute('data-icon')).toBe('cpu');
    expect(avatar.textContent).toBe('');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/features/agents/agentAvatar.test.ts -t "emoji"`
Expected: FAIL (emoji branch not implemented — falls to icon/initials).

- [ ] **Step 3: Implement the emoji branch**

In `src/features/agents/agentAvatar.ts`, insert this block immediately before `const glyph = persona.builtin ? 'cpu' : persona.icon;`:

```typescript
  if (!persona.builtin && persona.emoji) {
    avatar.addClass('specorator-agent-avatar--emoji');
    avatar.setText(persona.emoji);
    return avatar;
  }

```

(The color/size CSS props and `title`/`aria-label` are already set above this point, so the early return keeps them.)

- [ ] **Step 4: Add the CSS rule**

Append to `src/style/features/agent-roster.css` (near the `.specorator-agent-avatar--initials` rule):

```css
.specorator-agent-avatar--emoji {
  font-size: calc(var(--agent-avatar-size) * 0.62);
  line-height: 1;
}
```

- [ ] **Step 5: Run tests + CSS ratchet**

Run: `npx jest tests/unit/features/agents/agentAvatar.test.ts && npm run check:css`
Expected: PASS (tests green; no new `!important`, so the CSS ratchet holds).

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/agentAvatar.ts src/style/features/agent-roster.css tests/unit/features/agents/agentAvatar.test.ts
git commit -m "feat(agents): render emoji avatars with precedence over icon/initials"
```

---

## Task 6: Track voice + avatarEmoji as dirty

**Files:**
- Test: `tests/unit/features/agents/roster/rosterDirty.test.ts`
- Modify: `src/features/agents/roster/rosterDirty.ts`

- [ ] **Step 1: Write the failing tests**

Add inside `describe('isRosterAgentDirty', ...)` in `tests/unit/features/agents/roster/rosterDirty.test.ts`:

```typescript
  it('detects a voice change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, voice: 'Warm and concise' })).toBe(true);
  });

  it('detects an avatarEmoji change', () => {
    const a = base();
    expect(isRosterAgentDirty(a, { ...a, avatarEmoji: '🔬' })).toBe(true);
    expect(isRosterAgentDirty({ ...a, avatarEmoji: '🔬' }, { ...a, avatarEmoji: '🔬' })).toBe(false);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/features/agents/roster/rosterDirty.test.ts -t "voice change|avatarEmoji"`
Expected: FAIL (`voice` / `avatarEmoji` not in `SCALAR_KEYS`, so changes read as clean).

- [ ] **Step 3: Implement**

In `src/features/agents/roster/rosterDirty.ts`, extend `SCALAR_KEYS`:

```typescript
const SCALAR_KEYS = ['name', 'description', 'prompt', 'color', 'initials', 'icon', 'voice', 'avatarEmoji', 'providerOverride', 'permissionMode'] as const;
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/features/agents/roster/rosterDirty.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/roster/rosterDirty.ts tests/unit/features/agents/roster/rosterDirty.test.ts
git commit -m "feat(agents): treat voice + avatarEmoji edits as dirty in the detail editor"
```

---

## Task 7: Add the editor fields (emoji input + voice textarea)

**Files:**
- Test: `tests/unit/features/agents/roster/view/AgentDetailEditor.test.ts`
- Modify: `src/features/agents/roster/view/AgentDetailEditor.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `tests/unit/features/agents/roster/view/AgentDetailEditor.test.ts` (before the final closing lines):

```typescript
describe('AgentDetailEditor voice + emoji fields', () => {
  it('persists an edited voice field', async () => {
    const { editor, callbacks, root } = await renderEditor(makeAgent());
    const voice = root.querySelector('.specorator-roster-voice-input') as HTMLTextAreaElement;
    expect(voice).toBeTruthy();
    voice.value = 'Warm and concise';
    voice.dispatchEvent(new Event('input'));
    expect(editor.isDirty()).toBe(true);
    saveButton(root).click();
    await flush();
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ voice: 'Warm and concise' }));
  });

  it('persists an edited emoji field', async () => {
    const { editor, callbacks, root } = await renderEditor(makeAgent());
    const emoji = root.querySelector('.specorator-roster-appearance-emoji') as HTMLInputElement;
    expect(emoji).toBeTruthy();
    emoji.value = '🔬';
    emoji.dispatchEvent(new Event('input'));
    expect(editor.isDirty()).toBe(true);
    saveButton(root).click();
    await flush();
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ avatarEmoji: '🔬' }));
  });

  it('persists a multi-code-point emoji without truncation', async () => {
    const { callbacks, root } = await renderEditor(makeAgent());
    const emoji = root.querySelector('.specorator-roster-appearance-emoji') as HTMLInputElement;
    emoji.value = '👨‍👩‍👧‍👦';
    emoji.dispatchEvent(new Event('input'));
    saveButton(root).click();
    await flush();
    expect(callbacks.onSaved).toHaveBeenCalledWith(expect.objectContaining({ avatarEmoji: '👨‍👩‍👧‍👦' }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/features/agents/roster/view/AgentDetailEditor.test.ts -t "voice + emoji"`
Expected: FAIL (`.specorator-roster-voice-input` / `.specorator-roster-appearance-emoji` don't exist).

- [ ] **Step 3: Add the emoji input to the appearance row**

In `src/features/agents/roster/view/AgentDetailEditor.ts`, in `renderAppearanceRow`, append after the `iconSelect` `addEventListener('change', ...)` block (after line 145):

```typescript
    const emoji = row.createEl('input', { cls: 'specorator-roster-appearance-emoji', type: 'text' });
    // No maxLength: a UTF-16 code-unit cap would truncate a valid multi-code-point
    // emoji (e.g. a ZWJ family sequence like 👨‍👩‍👧‍👦) mid-grapheme and corrupt the avatar.
    emoji.value = this.draft.avatarEmoji ?? '';
    emoji.placeholder = t('agentRoster.emoji');
    emoji.setAttribute('aria-label', t('agentRoster.emoji'));
    emoji.addEventListener('input', () => {
      this.draft.avatarEmoji = emoji.value.trim() || undefined;
      this.refreshAvatar();
      this.updateDirty();
    });
```

- [ ] **Step 4: Add the voice textarea + wire it in**

In `renderHeaderCard`, add the voice row right after `this.renderAppearanceRow(fields);` (line 106):

```typescript
    this.renderAppearanceRow(fields);
    this.renderVoiceRow(fields);
    this.renderRolesRow(fields);
    this.renderTagsRow(fields);
```

Then add this new method (e.g. directly after `renderAppearanceRow`):

```typescript
  private renderVoiceRow(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: 'specorator-roster-voice' });
    const voice = row.createEl('textarea', { cls: 'specorator-roster-voice-input' });
    voice.rows = 2;
    voice.value = this.draft.voice ?? '';
    voice.placeholder = t('agentRoster.voicePlaceholder');
    voice.setAttribute('aria-label', t('agentRoster.voice'));
    voice.addEventListener('input', () => {
      this.draft.voice = voice.value.trim() ? voice.value : undefined;
      this.updateDirty();
    });
  }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/unit/features/agents/roster/view/AgentDetailEditor.test.ts`
Expected: PASS (new + existing editor tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/roster/view/AgentDetailEditor.ts tests/unit/features/agents/roster/view/AgentDetailEditor.test.ts
git commit -m "feat(agents): edit agent voice + emoji avatar in the detail editor"
```

---

## Task 8: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the gate suite**

Run: `npm run typecheck && npm run lint && npm run test -- --selectProjects unit && npm run build && npm run check:css`
Expected: all PASS. (No `.vue` changes this phase, so `typecheck:vue` / `test:vue` are unaffected.)

- [ ] **Step 2: Run the LOC + quality ratchets**

Run: `npm run check:loc && npm run check:quality`
Expected: PASS. If either ratchet trips **solely** on the net-new feature lines (not a regression), update the baseline in the same commit per [`docs/build-ci/quality-gates.md`](../../build-ci/quality-gates.md) and note it in the commit message.

- [ ] **Step 3: Manual smoke (optional, if a vault is available)**

Open an agent in the Library detail editor → set an emoji + a voice line → Save. Confirm the avatar shows the emoji in the Library card, and starting a chat bound to that agent adopts the voice. (Not required for CI; the unit tests cover the wiring.)

- [ ] **Step 4: Commit any ratchet-baseline update**

```bash
git add -A
git commit -m "chore(agents): update ratchet baselines for persona/voice fields"
```

(Skip if Step 2 needed no baseline change.)

---

## Self-Review

- **Spec coverage:** implements the spec's §5 persona/voice + avatar for the `voice` and `avatarEmoji` slices (image avatars explicitly deferred, noted in Scope). No other spec section is in this phase's scope.
- **Type consistency:** `voice` / `avatarEmoji` (RosterAgent) and `emoji` (AgentPersona) names are used identically across Tasks 1, 3, 4, 5, 6, 7. `BoundAgentPersonaInput.voice` matches the `RosterAgent.voice` name so the `{...agent}` spread in `resolveBoundAgent` binds it.
- **No placeholders:** every step carries the concrete code/command.
- **Ordering:** types (1) → i18n (2, before the editor uses `t()`) → pure-logic tasks (3–6) → editor (7, depends on 1/2/6) → verification (8).
