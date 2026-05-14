// ─── SPECORATOR SIDEPANEL — APP ──────────────────────────────────────────────
// Vault data, simulated responses, main App component + ReactDOM render

const {
  SP_T, SP_F, SP_M, makeSPColors, SPThemeCtx,
  SPHeader, SPTabBar,
  SPUserMsg, SPAgentMsg, SPTypingDots, SPFileCard, SPHintCard,
  SPAtMention, SPFilePicker, SPContextPanel,
} = window;

const { useTweaks, TweaksPanel, TweakSection, TweakColor } = window;

// ─── Vault ────────────────────────────────────────────────────────────────────
const SP_VAULT = [
  { id:'v1', name:'agent-panel-spec.md',    path:'Projects/specorator', size:'14k' },
  { id:'v2', name:'architecture-notes.md',  path:'Projects/specorator', size:'22k' },
  { id:'v3', name:'wireframe-decisions.md', path:'Projects/specorator', size:'8k'  },
  { id:'v4', name:'meeting-2026-05-01.md',  path:'Notes',               size:'5k'  },
  { id:'v5', name:'decisions-log.md',       path:'Notes',               size:'11k' },
  { id:'v6', name:'research-notes.md',      path:'Notes',               size:'18k' },
  { id:'v7', name:'cursor-ux-patterns.md',  path:'References',          size:'9k'  },
  { id:'v8', name:'obsidian-plugin-api.md', path:'References',          size:'31k' },
];

// ─── Simulated responses ──────────────────────────────────────────────────────
function buildResponse(msg, files) {
  const lc = msg.toLowerCase();
  const n = files.length;
  if (n === 0) {
    return "I don't have any vault files loaded yet. Add context using @ or the Attach button — I work much better when I can reference your actual notes.";
  }
  const list = n === 1 ? `**${files[0].name}**`
    : n === 2 ? `**${files[0].name}** and **${files[1].name}**`
    : files.slice(0,-1).map(f=>`**${f.name}**`).join(', ') + `, and **${files[n-1].name}**`;

  if (lc.match(/spec|prd|requirement|feature/)) {
    return `Based on ${list}: the spec describes a trust-first AI panel for Obsidian. Core user goal — a Cursor-like experience for spec writing, with human approval gates before any vault writes.\n\nWant me to draft a PRD from these notes?`;
  }
  if (lc.match(/arch|structure|technical|how does|how is/)) {
    return `From ${list}: the architecture uses a 4-tab shell — Chat · Context · Tasks · Session. The agent runs as a background worker; all vault operations surface through approval gates. Key constraint: confirm before every file write.\n\nWhat aspect would you like to explore?`;
  }
  if (lc.match(/summar|tldr|overview|explain|what is/)) {
    return `Here's a summary from ${list}:\n\nSpecorator is an Obsidian plugin that guides builders from idea → PRD → GitHub issues → PR. Trust-first design: the agent confirms before every file write, with approval gates and 24-hour undo windows at each step.`;
  }
  if (lc.match(/next step|what should|suggest|help|where/)) {
    return `With ${list} loaded, here's what I'd suggest:\n\n1. Generate a PRD to formalise requirements\n2. Review the architecture decisions for gaps\n3. Create GitHub issues from the spec\n\nWhich would you like to start with?`;
  }
  if (lc.match(/decision|why|rationale|chose|choice/)) {
    return `From ${list}, the key design decisions were:\n\n• Right sidebar — never occludes the editor\n• PR-centric output — all agent writes go through a draft PR\n• Streaming step log — transparency during multi-step generation\n• 24h undo window — safety net for all vault writes\n\nWant more detail on any of these?`;
  }
  if (lc.match(/open question|oq|unclear|ambig/)) {
    return `Scanning ${list} for open questions…\n\nOQ-1: Should the agent auto-detect feature scope from the active file?\nOQ-2: How do we handle context drift across long sessions?\nOQ-3: Autonomy dial — per-action or global?\n\nThese aren't resolved yet. Want me to surface them as GitHub issues?`;
  }
  return `I've read ${list}. Ready to help — I can generate a PRD, summarise the spec, surface open questions, or outline GitHub issues. What would you like to do?`;
}

// Split response text into streamable units (words + whitespace tokens)
function splitUnits(text) {
  return (text.match(/\S+|\s+/g) || []);
}

// ─── App ──────────────────────────────────────────────────────────────────────
function SPApp() {
  const DEFS = window.TWEAK_DEFAULTS || { accentColor:'#9580f8' };
  const [tweaks, setTweak] = useTweaks(DEFS);
  const accent = tweaks.accentColor || '#9580f8';
  const c = makeSPColors(accent);

  const [tab, setTab]           = React.useState('Chat');
  const [msgs, setMsgs]         = React.useState([
    { id:0, type:'agent', text:"Hey! Add files from your vault using @ or the Attach button, then ask me anything about your spec." },
  ]);
  const [context, setContext]   = React.useState([]);
  const [input, setInput]       = React.useState('');
  const [thinking, setThinking] = React.useState(false);
  const [streamTxt, setStream]  = React.useState('');
  const [atQuery, setAtQuery]   = React.useState(null); // null = closed
  const [atHl, setAtHl]         = React.useState(0);
  const [picker, setPicker]     = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [vaultFolders, setVaultFolders] = React.useState(() => {
    try { const s = localStorage.getItem('sp-vault-folders'); return s ? JSON.parse(s) : {'Projects/specorator':true,'Notes':true,'References':true}; }
    catch { return {'Projects/specorator':true,'Notes':true,'References':true}; }
  });
  const [autonomy, setAutonomy] = React.useState(() => localStorage.getItem('sp-autonomy') || 'assisted');

  const bottomRef = React.useRef(null);
  const inputRef  = React.useRef(null);
  const timerRef  = React.useRef(null);

  const activeIds = context.map(f => f.id);
  const hasUserMsg = msgs.some(m => m.type === 'user');
  const filteredVault = SP_VAULT.filter(f => vaultFolders[f.path] !== false);
  const folderStats = ['Projects/specorator','Notes','References'].map(name => ({
    name, enabled: vaultFolders[name] !== false,
    count: SP_VAULT.filter(f => f.path === name).length,
  }));
  const toggleFolder = (name) => {
    setVaultFolders(prev => {
      const next = { ...prev, [name]: !prev[name] };
      try { localStorage.setItem('sp-vault-folders', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const handleAutonomy = (level) => {
    setAutonomy(level);
    try { localStorage.setItem('sp-autonomy', level); } catch {};
  };

  // Auto-scroll messages
  React.useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const container = el.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [msgs, streamTxt, thinking]);

  // Auto-resize textarea via layout effect
  React.useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  // Cleanup timers on unmount
  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const addFile = (f) => {
    if (activeIds.includes(f.id)) return;
    setContext(prev => [...prev, f]);
    setMsgs(prev => [...prev, { id: Date.now() + Math.random(), type:'file', file:f }]);
  };

  const removeFile = (id) => setContext(prev => prev.filter(f => f.id !== id));

  const handleInputChange = (e) => {
    const v = e.target.value;
    setInput(v);
    const m = v.match(/@([^\s@]*)$/);
    if (m) { setAtQuery(m[1]); setAtHl(0); } else setAtQuery(null);
  };

  const selectAtFile = (f) => {
    setInput(prev => prev.replace(/@([^\s@]*)$/, '').trimEnd() + ' ');
    addFile(f);
    setAtQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (atQuery !== null) {
      const fl = filteredVault.filter(f =>
        f.name.toLowerCase().includes(atQuery.toLowerCase()) ||
        f.path.toLowerCase().includes(atQuery.toLowerCase())
      ).slice(0, 7);
      if (e.key === 'ArrowDown') { e.preventDefault(); setAtHl(h => Math.min(h+1, fl.length-1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setAtHl(h => Math.max(h-1, 0)); return; }
      if (e.key === 'Enter')     {
        e.preventDefault();
        const f = fl[atHl];
        if (f && !activeIds.includes(f.id)) selectAtFile(f);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setAtQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
    if (e.key === 'Escape') setPicker(false);
  };

  const sendMessage = (overrideText) => {
    const txt = (overrideText || input).trim();
    if (!txt || thinking || streamTxt) return;
    setMsgs(prev => [...prev, { id: Date.now(), type:'user', text:txt }]);
    setInput('');
    setAtQuery(null);
    setPicker(false);
    setThinking(true);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setThinking(false);
      const resp = buildResponse(txt, context);
      const units = splitUnits(resp);
      let i = 0;
      let acc = '';

      const tick = () => {
        if (i < units.length) {
          acc += units[i];
          const isWord = /\S/.test(units[i]);
          i++;
          setStream(acc);
          timerRef.current = setTimeout(tick, isWord ? 26 + Math.random() * 18 : 4);
        } else {
          setMsgs(prev => [...prev, { id: Date.now(), type:'agent', text:resp }]);
          setStream('');
        }
      };
      tick();
    }, 560 + Math.random() * 340);
  };

  return (
    <SPThemeCtx.Provider value={c}>
      <div style={{
        width:'100%', height:'100%', background:c.bg, fontFamily:SP_F,
        fontSize:SP_T.body, color:c.text, display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        <SPHeader onSettings={() => setSettingsOpen(true)} autonomy={autonomy} />
        {settingsOpen ? (
          <SPSettingsPanel
            folders={folderStats}
            onToggleFolder={toggleFolder}
            autonomy={autonomy}
            onAutonomy={handleAutonomy}
            onBack={() => setSettingsOpen(false)}
          />
        ) : (<>
        <SPTabBar active={tab} onChange={setTab} badges={{ Context: context.length || undefined }} />

        {/* ── Chat tab ── */}
        {tab === 'Chat' && (
          <>
            <div
              onClick={() => setPicker(false)}
              style={{ flex:1, overflowY:'auto', padding:'8px 0 4px', display:'flex', flexDirection:'column', gap:3, minHeight:0 }}
            >
              {msgs.map(m => {
                if (m.type === 'user') return <SPUserMsg key={m.id} text={m.text} />;
                if (m.type === 'file') return <SPFileCard key={m.id} file={m.file} />;
                return <SPAgentMsg key={m.id} text={m.text} />;
              })}

              {/* Hint card — shown after welcome if no user messages yet */}
              {!hasUserMsg && <SPHintCard />}

              {thinking && <SPTypingDots />}
              {streamTxt && <SPAgentMsg text={streamTxt} streaming />}
              <div ref={bottomRef} style={{ height:4, flexShrink:0 }} />
            </div>

            {/* ── Input area ── */}
            <div style={{ flexShrink:0, padding:'8px 12px 10px', position:'relative' }}>
              {/* @-mention popup */}
              {atQuery !== null && (
                <SPAtMention
                  query={atQuery}
                  vault={filteredVault}
                  activeIds={activeIds}
                  highlight={atHl}
                  onSelect={selectAtFile}
                  onHighlight={setAtHl}
                />
              )}

              {/* File picker popup */}
              {picker && (
                <SPFilePicker
                  vault={filteredVault}
                  activeIds={activeIds}
                  onAdd={addFile}
                  onRemove={removeFile}
                  onClose={() => { setPicker(false); setTimeout(() => inputRef.current?.focus(), 30); }}
                />
              )}

              {/* Unified input container */}
              <div style={{
                background:c.inputBg,
                border:`1px solid ${atQuery !== null ? c.accent : c.border}`,
                borderRadius:10, overflow:'hidden', transition:'border-color .12s',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Specorator…"
                  style={{
                    display:'block', width:'100%', background:'transparent',
                    border:'none', padding:'10px 12px 4px',
                    fontSize:SP_T.body, color:c.text, resize:'none',
                    fontFamily:SP_F, lineHeight:1.45, minHeight:42,
                    outline:'none', overflow:'hidden',
                  }}
                />
                {/* Action bar */}
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'0 8px 8px' }}>
                  <button
                    onMouseDown={e => { e.preventDefault(); setPicker(p => !p); setAtQuery(null); }}
                    style={{
                      display:'flex', alignItems:'center', gap:3, padding:'2px 7px',
                      background:picker ? c.accentSoft : c.surfAlt,
                      border:`1px solid ${picker ? c.accentBorder : c.borderMid}`,
                      borderRadius:4, fontSize:SP_T.meta,
                      color:picker ? c.accent : c.muted,
                      cursor:'pointer', fontFamily:SP_F, transition:'all .12s',
                    }}
                  >↓ Attach</button>
                  <span style={{ fontSize:SP_T.meta, color:c.muted }}>
                    or{' '}<code style={{ color:c.accent, fontFamily:SP_M, fontSize:SP_T.small, background:c.accentSoft, padding:'0 3px', borderRadius:2 }}>@file</code>
                  </span>
                  <div style={{ flex:1 }} />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || !!streamTxt || thinking}
                    style={{
                      width:26, height:26, flexShrink:0, border:'none',
                      background:input.trim() && !streamTxt && !thinking ? c.accent : c.border,
                      borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
                      color:'#fff', fontSize:12, cursor:'pointer', transition:'background .12s',
                    }}
                  >↑</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Context tab ── */}
        {tab === 'Context' && (
          <SPContextPanel
            vault={filteredVault}
            activeFiles={context}
            onAdd={addFile}
            onRemove={removeFile}
          />
        )}
        </>)}

        {/* Tweaks panel */}
        <TweaksPanel title="Tweaks">
          <TweakSection label="Theme" />
          <TweakColor label="Accent color" value={tweaks.accentColor} onChange={v => setTweak('accentColor', v)} />
        </TweaksPanel>
      </div>
    </SPThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SPApp />);
