// Specorator wireframes — design canvas wiring + tweaks
// Sections ordered for walkthrough: rationale → product → states → core flows → interactions → safety → system → help

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "comfy"
}/*EDITMODE-END*/;

// ─── 0. Why we're here ────────────────────────────────────────────────────
const SEC_RATIONALE = {
  id: 'rationale',
  title: '00 · Design rationale',
  subtitle: 'Start here. Fundamentals, core principles, key decisions, trade-offs, non-goals. Sets the frame for everything that follows — skim the top half before walking through any screen.',
  artboards: [
    { id: 'rationale', label: 'Principles, decisions & open questions', src: 'artboards/rationale.html', w: 1080, h: 2400 },
  ],
};

// ─── 1. The product ───────────────────────────────────────────────────────
const SEC_PRODUCT = {
  id: 'product',
  title: '01 · The product',
  subtitle: 'First impressions and the four layout directions. Walk: Onboarding → then compare A/B/C/D to see which cockpit model fits best → Walkthrough shows the in-product tour.',
  artboards: [
    { id: 'onboarding',  label: '1a · Onboarding — first run, plain-language welcome', src: 'artboards/onboarding.html',  w: 1280, h: 800 },
    { id: 'cockpit-A',   label: '1b · Cockpit A — three-pane, context-aware (v1 default)', src: 'artboards/cockpit-A.html',  w: 1280, h: 800 },
    { id: 'cockpit-B',   label: '1c · Cockpit B — vertical rail, focused stage', src: 'artboards/cockpit-B.html',  w: 1280, h: 800 },
    { id: 'cockpit-C',   label: '1d · Cockpit C — stages-as-board, drag to hand-off', src: 'artboards/cockpit-C.html',  w: 1280, h: 800 },
    { id: 'cockpit-D',   label: '1e · Cockpit D — feed view, what needs you', src: 'artboards/cockpit-D.html',  w: 1280, h: 800 },
    { id: 'walkthrough', label: '1f · Walkthrough — first-feature cockpit tour (spotlight)', src: 'artboards/walkthrough.html', w: 1280, h: 800 },
  ],
};

// ─── 2. Cockpit A · edge cases ────────────────────────────────────────────
const SEC_STATES = {
  id: 'states',
  title: '02 · Cockpit A · edge cases',
  subtitle: 'Everything the three-pane cockpit must handle gracefully. Walk in order: brand-new vault → scaffolded but empty → gate failing → gate passing → stale/blocked → just handed off.',
  artboards: [
    { id: 's-newvault',  label: '2a · Brand-new vault — no specs yet', src: 'artboards/state-newvault.html',  w: 1280, h: 800 },
    { id: 's-empty',     label: '2b · Scaffolded, no feature in focus', src: 'artboards/state-empty.html',    w: 1280, h: 800 },
    { id: 's-gate-fail', label: '2c · Gate failing (canonical Cockpit A state)', src: 'artboards/state-gate-fail.html', w: 1280, h: 800 },
    { id: 's-gate-pass', label: '2d · Gate passing — ready to advance', src: 'artboards/state-gate-pass.html', w: 1280, h: 800 },
    { id: 's-stale',     label: '2e · Stale / blocked externally', src: 'artboards/state-stale.html',    w: 1280, h: 800 },
    { id: 's-undo',      label: '2f · Just handed off — undo + safety net', src: 'artboards/state-undo.html',    w: 1280, h: 800 },
  ],
};

// ─── 3. Core user flows ───────────────────────────────────────────────────
const SEC_CORE_FLOWS = {
  id: 'core-flows',
  title: '03 · Core user flows',
  subtitle: 'The most-travelled paths. Walk: first feature (the "earning trust" moment) → second session (returning user) → hand-off (the most-used micro-interaction).',
  artboards: [
    { id: 'flow-first-feature', label: '3a · First feature — from "I have an idea" to step 1 (the first 60 seconds)', src: 'artboards/flow-first-feature.html', w: 2600, h: 1400 },
    { id: 'flow-session2',      label: '3b · Second session — exploring → committed', src: 'artboards/flow-session2.html',      w: 2700, h: 1800 },
    { id: 'flow-handoff',       label: '3c · Hand-off — the most-used micro-interaction', src: 'artboards/flow-handoff.html',       w: 2900, h: 1700 },
  ],
};

// ─── 4. Key interactions ──────────────────────────────────────────────────
const SEC_INTERACTIONS = {
  id: 'interactions',
  title: '04 · Key interactions',
  subtitle: 'Where the discipline lives. Gate review enforces quality; open questions capture uncertainty; ADRs record decisions; skip shows how steps can be bypassed legitimately.',
  artboards: [
    { id: 'flow-gate', label: '4a · Gate review — where the discipline lives', src: 'artboards/flow-gate.html', w: 2900, h: 1700 },
    { id: 'flow-oq',   label: '4b · Open question — ? → collected → resolved', src: 'artboards/flow-oq.html',  w: 2700, h: 1800 },
    { id: 'flow-oq2',  label: '4c · OQ-2 resolved — cockpit empty state decision', src: 'artboards/flow-oq2.html',  w: 2200, h: 1500 },
    { id: 'flow-adr',  label: '4d · Decision note — the most-resisted artifact', src: 'artboards/flow-adr.html',  w: 2700, h: 1600 },
    { id: 'flow-skip', label: '4e · Skip steps — OQ-4 resolved', src: 'artboards/flow-skip.html', w: 2700, h: 1700 },
  ],
};

// ─── 5. Safety nets ───────────────────────────────────────────────────────
const SEC_SAFETY = {
  id: 'safety',
  title: '05 · Safety nets',
  subtitle: 'Undo, revert, and recovery. Users need to feel safe experimenting. These flows show how the product handles "I made a mistake" and "where am I?" without anxiety.',
  artboards: [
    { id: 'flow-recovery', label: '5a · Recovery — undo, revert, "where am I?"', src: 'artboards/flow-recovery.html', w: 2800, h: 2200 },
    { id: 'flow-completion', label: '5b · Feature completion & archival', src: 'artboards/flow-completion.html', w: 2700, h: 1900 },
  ],
};

// ─── 6. System catalogues ─────────────────────────────────────────────────
const SEC_SYSTEM = {
  id: 'system',
  title: '06 · System catalogues',
  subtitle: 'Reference material — not a flow, but a complete inventory. Useful for eng hand-off. Constitution covers team-level house rules; settings and keyboard show configuration surface area. Team mode (6e) resolves OQ-5: shared vault + conventions, no server.',
  artboards: [
    { id: 'flow-constitution', label: '6a · Constitution & house rules', src: 'artboards/flow-constitution.html', w: 2700, h: 1900 },
    { id: 'flow-feedback',     label: '6b · Errors, feedback & notifications catalogue', src: 'artboards/flow-feedback.html',     w: 2400, h: 2000 },
    { id: 'flow-settings',     label: '6c · Settings & configuration catalogue', src: 'artboards/flow-settings.html',     w: 2000, h: 2400 },
    { id: 'flow-keyboard',     label: '6d · Keyboard & command palette catalogue', src: 'artboards/flow-keyboard.html',     w: 2000, h: 2200 },
    { id: 'flow-team',         label: '6e · Team mode — OQ-5 resolved (shared vault, no server)', src: 'artboards/flow-team.html', w: 3200, h: 2400 },
  ],
};

// ─── 7. Help system ───────────────────────────────────────────────────────
const SEC_HELP = {
  id: 'help',
  title: '07 · Help system',
  subtitle: 'Every jargon term carries a (?) that opens a same-shape popover: one-line definition, one-paragraph why, one link to read more. Consistent pattern across the whole product.',
  artboards: [
    { id: 'help-popovers', label: '7a · Concept popovers — jargon explainers', src: 'artboards/help-popovers.html', w: 1280, h: 800 },
  ],
};

const ALL_SECTIONS = [
  SEC_RATIONALE,
  SEC_PRODUCT,
  SEC_STATES,
  SEC_CORE_FLOWS,
  SEC_INTERACTIONS,
  SEC_SAFETY,
  SEC_SYSTEM,
  SEC_HELP,
];

function ArtboardFrame({ src, theme, density }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const apply = () => {
      try {
        const b = f.contentDocument && f.contentDocument.body;
        if (!b) return;
        b.dataset.theme = theme;
        b.classList.remove('density-comfy', 'density-compact');
        b.classList.add('density-' + density);
      } catch (e) {}
    };
    apply();
    f.addEventListener('load', apply);
    return () => f.removeEventListener('load', apply);
  }, [src, theme, density]);
  return (
    <iframe
      ref={ref}
      src={src}
      style={{ width: '100%', height: '100%', border: 0, background: 'transparent', display: 'block' }}
      title={src}
    />
  );
}

function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);

  return (
    <>
      <DesignCanvas>
        {ALL_SECTIONS.map(sec => (
          <DCSection
            key={sec.id}
            id={sec.id}
            title={sec.title}
            subtitle={sec.subtitle}
          >
            {sec.artboards.map(a => (
              <DCArtboard key={a.id} id={a.id} label={a.label} width={a.w} height={a.h}>
                <ArtboardFrame src={a.src} theme={tw.theme} density={tw.density} />
              </DCArtboard>
            ))}
          </DCSection>
        ))}
      </DesignCanvas>

      <TweaksPanel title="Wireframe tweaks">
        <TweakRadio
          label="Theme"
          value={tw.theme}
          onChange={(v) => setTweak('theme', v)}
          options={[
            { value: 'dark',  label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
        <TweakRadio
          label="Density"
          value={tw.density}
          onChange={(v) => setTweak('density', v)}
          options={[
            { value: 'comfy',   label: 'Comfy' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
        <TweakSection title="Walkthrough order">
          <div style={{ fontSize: 12, color: '#5a4a2a', lineHeight: 1.6 }}>
            <b>00</b> Rationale — start here<br />
            <b>01</b> Product — onboarding + cockpits<br />
            <b>02</b> Edge cases — cockpit A states<br />
            <b>03</b> Core flows — first feature → hand-off<br />
            <b>04</b> Key interactions — gate, OQs, ADR<br />
            <b>05</b> Safety nets — recovery + archival<br />
            <b>06</b> System — catalogues for eng hand-off<br />
            <b>07</b> Help system — popovers
          </div>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
