// ─── SPECORATOR SIDEPANEL — COMPONENTS ───────────────────────────────────────
// Design tokens, theme context, all visual components
// All symbols exported via Object.assign(window, …)

const SP_BASE = {
  bg:'#1e1e2e', bgSub:'#16161f', surf:'#252535', surfAlt:'#2a2a3c',
  border:'#38385a', borderMid:'#2e2e48', text:'#c9d1d9', muted:'#72729a',
  userBg:'#3d2f6e', fileBg:'#192820', fileBord:'#2d4838', inputBg:'#252535',
  ok:'#4ade80', warn:'#fbbf24',
};
const SP_T = { body:13, label:12, small:11, meta:10, micro:9 };
const SP_F = "'Inter',-apple-system,'Segoe UI',sans-serif";
const SP_M = "'JetBrains Mono',ui-monospace,monospace";

function makeSPColors(accent) {
  const a = accent || '#9580f8';
  return { ...SP_BASE, accent:a, accentSoft:a+'1e', accentBorder:a+'55' };
}

const SPThemeCtx = React.createContext(makeSPColors());
const useSPTheme = () => React.useContext(SPThemeCtx);

// ─── Panel Header ─────────────────────────────────────────────────────────────
function SPHeader({ onSettings, autonomy }) {
  const c = useSPTheme();
  return (
    <div style={{ padding:'0 12px', background:c.bgSub, flexShrink:0 }}>
      <div style={{ height:44, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{
          width:22, height:22, borderRadius:5, flexShrink:0,
          background:c.accentSoft, border:`1px solid ${c.accentBorder}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:8, fontWeight:800, color:c.accent, letterSpacing:'-0.3px',
          fontFamily:SP_M,
        }}>SW</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:SP_T.label, fontWeight:700, color:c.text, lineHeight:1.3, letterSpacing:'-0.2px' }}>Spec Writer</div>
          <div style={{ fontSize:SP_T.micro, color:c.muted }}>Writing assistant</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:c.ok, display:'block' }} />
          <span style={{ fontSize:SP_T.meta, color:c.muted }}>Ready</span>
        </div>
        <button onClick={onSettings} style={{
          display:'flex', alignItems:'center', gap:3, padding:'3px 7px',
          border:`1px solid ${c.border}`, background:'none', borderRadius:4,
          cursor:'pointer', color:c.muted, fontSize:SP_T.micro, fontFamily:SP_F,
        }}>
          <span style={{ fontSize:10 }}>⚙</span> Settings
        </button>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5, paddingBottom:8, marginTop:-4 }}>
        {autonomy === 'autonomous'
          ? <span style={{ fontSize:SP_T.micro, color:c.ok, fontWeight:500 }}>Running without confirmation</span>
          : <>
              <span style={{ fontSize:SP_T.micro, color:c.muted }}>Confirms before:</span>
              <span style={{ fontSize:SP_T.micro, color:c.accent, fontWeight:500 }}>
                {autonomy === 'supervised' ? 'all actions' : 'file writes · commits · PRs'}
              </span>
            </>
        }
      </div>
    </div>
  );
}

// ─── Context Strip ────────────────────────────────────────────────────────────
function SPContextStrip({ files, onRemove, onOpenContext }) {
  const c = useSPTheme();
  const vis = files.slice(0, 2);
  const extra = files.length - 2;
  return (
    <div style={{
      minHeight:34, padding:'4px 12px', display:'flex', alignItems:'center',
      gap:5, flexShrink:0, borderBottom:`1px solid ${c.borderMid}`, flexWrap:'wrap',
    }}>
      <span style={{ fontSize:SP_T.small, fontWeight:600, color:c.muted, flexShrink:0 }}>@</span>
      {files.length === 0 && (
        <span style={{ fontSize:SP_T.meta, color:c.muted, fontStyle:'italic' }}>no context</span>
      )}
      {vis.map(f => (
        <div key={f.id} style={{
          display:'flex', alignItems:'center', gap:4, flexShrink:0,
          background:c.accentSoft, border:`1px solid ${c.accentBorder}`,
          borderRadius:4, padding:'2px 7px', animation:'fadein .18s ease',
        }}>
          <span style={{ fontSize:SP_T.meta, color:c.accent, fontWeight:500, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
          <button onClick={() => onRemove(f.id)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', color:c.muted, fontSize:9, lineHeight:1, display:'flex' }}>✕</button>
        </div>
      ))}
      {extra > 0 && (
        <button onClick={onOpenContext} style={{
          background:c.surf, border:`1px solid ${c.border}`, borderRadius:4,
          padding:'2px 7px', cursor:'pointer', fontSize:SP_T.meta, color:c.muted, fontFamily:SP_F,
        }}>+{extra} more ↓</button>
      )}
      <span onClick={onOpenContext} style={{
        marginLeft:'auto', fontSize:SP_T.meta, color:c.accent, cursor:'pointer',
        borderBottom:`1px dashed ${c.accentBorder}`, lineHeight:1.4,
        whiteSpace:'nowrap', flexShrink:0, paddingBottom:1,
      }}>+ context</span>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────
function SPTabBar({ active, onChange, badges }) {
  const c = useSPTheme();
  return (
    <div style={{ display:'flex', borderBottom:`1px solid ${c.border}`, flexShrink:0 }}>
      {['Chat','Context'].map(t => {
        const on = t === active;
        const badge = badges && badges[t];
        return (
          <div key={t} onClick={() => onChange(t)} style={{
            padding:'7px 14px', fontSize:SP_T.label, fontWeight:on?600:400,
            color:on ? c.accent : c.muted, cursor:'pointer', userSelect:'none',
            borderBottom:on ? `2px solid ${c.accent}` : '2px solid transparent',
            marginBottom:-1, transition:'color .1s',
            display:'flex', alignItems:'center', gap:5,
          }}>
            {t}
            {badge ? (
              <span style={{
                fontSize:9, background:c.accentSoft, color:c.accent,
                borderRadius:8, padding:'1px 5px', fontWeight:600, lineHeight:1.4,
              }}>{badge}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── Markdown helpers ───────────────────────────────────────────────────────────
function spInline(text, c) {
  const parts = [];
  const rx = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0, m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<strong key={m.index} style={{ fontWeight:600 }}>{m[1]}</strong>);
    else if (m[2]) parts.push(<em key={m.index}>{m[2]}</em>);
    else if (m[3]) parts.push(
      <code key={m.index} style={{ fontFamily:SP_M, fontSize:SP_T.small, background:'rgba(255,255,255,.07)', borderRadius:3, padding:'1px 5px', color:c.accent }}>{m[3]}</code>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function spMD(text, c) {
  if (!text) return null;
  const paras = text.split(/\n\n+/);
  return paras.map((para, pi) => {
    const isLast = pi === paras.length - 1;
    const lines = para.split('\n').filter(l => l.length > 0);
    const allList = lines.length > 0 && lines.every(l => /^\d+\.\s|^[-•]\s/.test(l));
    if (allList) {
      return (
        <div key={pi} style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:isLast?0:10 }}>
          {lines.map((line, li) => (
            <div key={li} style={{ display:'flex', gap:7, alignItems:'flex-start' }}>
              <span style={{ color:c.accent, flexShrink:0, fontSize:SP_T.meta, marginTop:1, fontVariantNumeric:'tabular-nums', minWidth:14 }}>
                {/^\d+\./.test(line) ? line.match(/^\d+/)[0]+'.' : '•'}
              </span>
              <span>{spInline(line.replace(/^\d+\.\s*|^[-•]\s*/, ''), c)}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <p key={pi} style={{ margin:0, marginBottom:isLast?0:8, lineHeight:1.6 }}>
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br/>}
            {spInline(line, c)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────
function SPUserMsg({ text }) {
  const c = useSPTheme();
  return (
    <div style={{ padding:'3px 12px', display:'flex', justifyContent:'flex-end', animation:'fadein .22s ease' }}>
      <div style={{
        maxWidth:'78%', background:c.userBg, color:'#e0d8ff',
        borderRadius:'12px 12px 2px 12px', padding:'7px 11px',
        fontSize:SP_T.body, lineHeight:1.55, whiteSpace:'pre-wrap', wordBreak:'break-word',
      }}>{text}</div>
    </div>
  );
}

function SPAgentMsg({ text, streaming }) {
  const c = useSPTheme();
  return (
    <div style={{ padding:'3px 12px', display:'flex', gap:7, alignItems:'flex-start', animation:'fadein .25s ease' }}>
      <div style={{
        width:22, height:22, borderRadius:'50%', flexShrink:0, marginTop:2,
        background:`linear-gradient(135deg,${c.accent},${c.accent}aa)`,
        color:'#fff', fontSize:10, fontWeight:800,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>S</div>
      <div style={{
        flex:1, background:c.surf, border:`1px solid ${c.border}`,
        borderRadius:'2px 12px 12px 12px', padding:'8px 11px',
        fontSize:SP_T.body, lineHeight:1.6, color:c.text,
        wordBreak:'break-word',
      }}>
        {streaming ? text : spMD(text, c)}
        {streaming && (
          <span style={{
            display:'inline-block', width:1, height:13, background:c.accent,
            verticalAlign:'text-bottom', marginLeft:2,
            animation:'blink 1s step-end infinite',
          }} />
        )}
      </div>
    </div>
  );
}

function SPTypingDots() {
  const c = useSPTheme();
  return (
    <div style={{ padding:'3px 12px', display:'flex', gap:7, alignItems:'flex-start' }}>
      <div style={{
        width:22, height:22, borderRadius:'50%', flexShrink:0, marginTop:2,
        background:`linear-gradient(135deg,${c.accent},${c.accent}aa)`,
        color:'#fff', fontSize:10, fontWeight:800,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>S</div>
      <div style={{
        background:c.surf, border:`1px solid ${c.border}`,
        borderRadius:'2px 12px 12px 12px', padding:'10px 14px',
        display:'flex', gap:4, alignItems:'center',
      }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            display:'inline-block', width:6, height:6, borderRadius:'50%', background:c.accent,
            animation:`dotpulse 1.2s ease-in-out ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function SPFileCard({ file }) {
  const c = useSPTheme();
  return (
    <div style={{
      margin:'2px 12px', display:'flex', alignItems:'center', gap:8,
      padding:'6px 10px', background:c.fileBg, border:`1px solid ${c.fileBord}`,
      borderRadius:6, animation:'fadein .2s ease',
    }}>
      <div style={{
        width:22, height:22, background:c.border, borderRadius:3, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:8, color:c.muted, fontFamily:SP_M,
      }}>md</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:SP_T.small, color:c.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</div>
        <div style={{ fontSize:SP_T.micro, color:c.muted }}>{file.path} · {file.size}</div>
      </div>
      <span style={{ fontSize:9, color:c.accent, background:c.accentSoft, borderRadius:3, padding:'1px 5px', flexShrink:0, whiteSpace:'nowrap' }}>added to context</span>
    </div>
  );
}

function SPHintCard() {
  const c = useSPTheme();
  return (
    <div style={{
      margin:'4px 12px', padding:'10px 12px', background:c.bgSub,
      border:`1px solid ${c.borderMid}`, borderRadius:7,
    }}>
      <div style={{ fontSize:SP_T.small, fontWeight:600, color:c.muted, marginBottom:6 }}>To get started</div>
      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {[
          ['↓','Click Attach to browse your vault'],
          ['@','Type @filename in the message box'],
          ['→','Switch to Context tab to manage files'],
        ].map(([icon, text]) => (
          <div key={icon} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:18, height:18, borderRadius:4, background:c.surfAlt, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:c.accent, flexShrink:0 }}>{icon}</span>
            <span style={{ fontSize:SP_T.small, color:c.muted }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── @-mention popup ──────────────────────────────────────────────────────────
function SPAtMention({ query, vault, activeIds, highlight, onSelect, onHighlight }) {
  const c = useSPTheme();
  const filtered = vault.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase()) ||
    f.path.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 7);
  if (!filtered.length) return null;
  return (
    <div style={{
      position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0,
      background:c.surf, border:`1px solid ${c.border}`, borderRadius:8,
      overflow:'hidden', boxShadow:'0 -8px 28px rgba(0,0,0,.5)',
      animation:'fadein .15s ease', zIndex:100,
    }}>
      <div style={{
        padding:'3px 10px', borderBottom:`1px solid ${c.border}`,
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <span style={{ fontSize:SP_T.micro, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.4px' }}>Add to context</span>
        <span style={{ fontSize:SP_T.micro, color:c.muted }}>↑↓ · ↵ add · ⎋ close</span>
      </div>
      {filtered.map((f, i) => {
        const isAdded = activeIds.includes(f.id);
        const isHl = i === highlight;
        return (
          <div
            key={f.id}
            onMouseDown={e => { e.preventDefault(); if (!isAdded) onSelect(f); }}
            onMouseEnter={() => onHighlight(i)}
            style={{
              padding:'5px 10px', display:'flex', alignItems:'center', gap:8,
              background:isHl ? c.surfAlt : 'transparent',
              cursor:isAdded ? 'default' : 'pointer',
              borderBottom:i < filtered.length - 1 ? `1px solid ${c.borderMid}` : 'none',
              opacity:isAdded ? 0.5 : 1,
            }}
          >
            <div style={{ width:16, height:16, background:c.border, borderRadius:2, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:c.muted, fontFamily:SP_M }}>md</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:SP_T.small, color:c.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
              <div style={{ fontSize:SP_T.micro, color:c.muted }}>{f.path}</div>
            </div>
            {isAdded
              ? <span style={{ fontSize:SP_T.micro, color:c.muted, flexShrink:0 }}>added</span>
              : <span style={{ fontSize:SP_T.micro, color:c.accent, fontWeight:600, flexShrink:0 }}>+ add</span>
            }
          </div>
        );
      })}
    </div>
  );
}

// ─── Vault file picker (Attach button) ───────────────────────────────────────
function SPFilePicker({ vault, activeIds, onAdd, onRemove, onClose }) {
  const c = useSPTheme();
  const [q, setQ] = React.useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);
  const filtered = vault.filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()) || f.path.toLowerCase().includes(q.toLowerCase()));
  const groups = filtered.reduce((acc, f) => { (acc[f.path] = acc[f.path] || []).push(f); return acc; }, {});
  return (
    <div onMouseDown={e => e.stopPropagation()} style={{
      position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0,
      background:c.surf, border:`1px solid ${c.border}`, borderRadius:8,
      overflow:'hidden', boxShadow:'0 -8px 28px rgba(0,0,0,.5)',
      animation:'fadein .15s ease', zIndex:100,
    }}>
      <div style={{ padding:'7px 10px', borderBottom:`1px solid ${c.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:SP_T.small, fontWeight:600, color:c.text }}>Add from vault</span>
        <button onMouseDown={e => { e.preventDefault(); onClose(); }} style={{ background:'none', border:'none', cursor:'pointer', color:c.muted, fontSize:SP_T.body, padding:0, fontFamily:SP_F }}>✕</button>
      </div>
      <div style={{ padding:'5px 8px', borderBottom:`1px solid ${c.borderMid}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, background:c.inputBg, border:`1px solid ${c.border}`, borderRadius:5, padding:'4px 8px' }}>
          <span style={{ color:c.muted, fontSize:SP_T.small }}>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search vault…"
            style={{ background:'none', border:'none', outline:'none', color:c.text, fontSize:SP_T.small, flex:1, fontFamily:SP_F }}
          />
          {q && <button onMouseDown={e => { e.preventDefault(); setQ(''); }} style={{ background:'none', border:'none', cursor:'pointer', color:c.muted, fontSize:SP_T.meta, padding:0 }}>✕</button>}
        </div>
      </div>
      <div style={{ overflowY:'auto', maxHeight:220, paddingBottom:4 }}>
        {Object.entries(groups).map(([folder, files]) => (
          <div key={folder}>
            <div style={{ padding:'5px 10px 2px', fontSize:SP_T.micro, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.4px' }}>
              ▾ {folder}
            </div>
            {files.map(f => {
              const isAct = activeIds.includes(f.id);
              return (
                <div key={f.id} style={{ padding:'4px 10px 4px 22px', display:'flex', alignItems:'center', gap:7, background:isAct ? c.accentSoft : 'transparent' }}>
                  <div style={{ width:16, height:16, background:c.border, borderRadius:2, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:c.muted, fontFamily:SP_M }}>md</div>
                  <span style={{ flex:1, fontSize:SP_T.small, color:isAct ? c.accent : c.text, fontWeight:isAct ? 500 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize:SP_T.micro, color:c.muted, flexShrink:0 }}>{f.size}</span>
                  {isAct
                    ? <button onMouseDown={e => { e.preventDefault(); onRemove(f.id); }} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:c.muted, fontSize:9 }}>✕</button>
                    : <button onMouseDown={e => { e.preventDefault(); onAdd(f); }} style={{ background:'none', border:`1px solid ${c.border}`, cursor:'pointer', padding:'1px 6px', borderRadius:3, fontSize:SP_T.micro, color:c.accent, lineHeight:'16px', fontFamily:SP_F }}>+</button>
                  }
                </div>
              );
            })}
          </div>
        ))}
        {!filtered.length && (
          <div style={{ padding:'16px', textAlign:'center', fontSize:SP_T.small, color:c.muted }}>No files match "{q}"</div>
        )}
      </div>
    </div>
  );
}

// ─── Context tab ──────────────────────────────────────────────────────────────
function SPContextPanel({ vault, activeFiles, onAdd, onRemove }) {
  const c = useSPTheme();
  const [q, setQ] = React.useState('');
  const activeIds = activeFiles.map(f => f.id);
  const totalKb = activeFiles.reduce((s, f) => s + parseInt(f.size), 0);
  const pct = Math.min(Math.round(totalKb / 128 * 100), 100);
  const isWarn = pct > 70;
  const filtered = vault.filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()) || f.path.toLowerCase().includes(q.toLowerCase()));
  const groups = filtered.reduce((acc, f) => { (acc[f.path] = acc[f.path] || []).push(f); return acc; }, {});
  return (
    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Active context */}
      <div style={{ padding:'10px 12px 8px', flexShrink:0 }}>
        <div style={{ fontSize:SP_T.meta, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:7 }}>Active Context</div>
        {activeFiles.length === 0 ? (
          <div style={{ padding:'12px 10px', background:c.surfAlt, borderRadius:6, fontSize:SP_T.small, color:c.muted, textAlign:'center', lineHeight:1.7 }}>
            No files added yet<br/>
            <span style={{ color:c.accent }}>Browse the vault below to add context</span>
          </div>
        ) : (
          <>
            {activeFiles.map(f => (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:c.accentSoft, border:`1px solid ${c.fileBord}`, borderRadius:5, marginBottom:4, animation:'fadein .2s ease' }}>
                <div style={{ width:18, height:18, background:c.border, borderRadius:3, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:c.muted, fontFamily:SP_M }}>md</div>
                <span style={{ flex:1, fontSize:SP_T.small, color:c.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
                <span style={{ fontSize:9, color:c.muted, flexShrink:0 }}>{f.size}</span>
                <button onClick={() => onRemove(f.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:c.muted, fontSize:SP_T.meta }}>✕</button>
              </div>
            ))}
            <div style={{ marginTop:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontSize:SP_T.micro, color:c.muted }}>Context space</span>
                <span style={{ fontSize:SP_T.micro, color:isWarn ? c.warn : c.ok, fontWeight:600 }}>{isWarn ? '⚠ ' : ''}{pct}% used</span>
              </div>
              <div style={{ height:3, background:c.border, borderRadius:2, overflow:'hidden', marginBottom:6 }}>
                <div style={{ width:`${pct}%`, height:'100%', background:isWarn ? c.warn : c.ok, borderRadius:2, transition:'width .4s ease' }} />
              </div>
              <span onClick={() => activeFiles.forEach(f => onRemove(f.id))} style={{ fontSize:SP_T.meta, color:c.muted, cursor:'pointer', borderBottom:`1px dashed ${c.border}` }}>Clear all</span>
            </div>
          </>
        )}
      </div>
      <div style={{ height:1, background:c.border, flexShrink:0 }} />
      {/* Vault browser */}
      <div style={{ padding:'8px 12px 5px', flexShrink:0 }}>
        <div style={{ fontSize:SP_T.meta, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>Add from Vault</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', background:c.inputBg, border:`1px solid ${c.border}`, borderRadius:5 }}>
          <span style={{ color:c.muted, fontSize:SP_T.small }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vault…"
            style={{ background:'none', border:'none', outline:'none', color:c.text, fontSize:SP_T.small, flex:1, fontFamily:SP_F }} />
          {q && <button onClick={() => setQ('')} style={{ background:'none', border:'none', cursor:'pointer', color:c.muted, fontSize:SP_T.meta, padding:0 }}>✕</button>}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:8 }}>
        {Object.entries(groups).map(([folder, files]) => (
          <div key={folder}>
            <div style={{ padding:'5px 12px 2px', fontSize:SP_T.micro, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.4px' }}>▾ {folder}</div>
            {files.map(f => {
              const isAct = activeIds.includes(f.id);
              return (
                <div key={f.id} style={{ padding:'4px 12px 4px 22px', display:'flex', alignItems:'center', gap:7, background:isAct ? c.accentSoft : 'transparent' }}>
                  <div style={{ width:16, height:16, background:c.border, borderRadius:2, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:c.muted, fontFamily:SP_M }}>md</div>
                  <span style={{ flex:1, fontSize:SP_T.small, color:isAct ? c.accent : c.text, fontWeight:isAct ? 500 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize:SP_T.micro, color:c.muted, flexShrink:0 }}>{f.size}</span>
                  {isAct
                    ? <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
                        <span style={{ fontSize:9, color:c.muted }}>active</span>
                        <button onClick={() => onRemove(f.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:c.muted, fontSize:9 }}>✕</button>
                      </div>
                    : <button onClick={() => onAdd(f)} style={{ background:'none', border:`1px solid ${c.border}`, cursor:'pointer', padding:'1px 7px', borderRadius:3, fontSize:SP_T.meta, color:c.accent, lineHeight:'16px', fontFamily:SP_F, flexShrink:0 }}>+</button>
                  }
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Toggle switch ──────────────────────────────────────────────────────────────
function SPToggle({ on, onChange }) {
  const c = useSPTheme();
  return (
    <div onClick={onChange} style={{
      width:28, height:16, borderRadius:8, cursor:'pointer', flexShrink:0,
      background:on ? c.accent : c.border, transition:'background .15s',
      position:'relative', display:'inline-block',
    }}>
      <div style={{
        position:'absolute', top:2, left:on ? 12 : 2, width:12, height:12,
        borderRadius:'50%', background:'#fff',
        transition:'left .15s ease', boxShadow:'0 1px 3px rgba(0,0,0,.3)',
      }} />
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SPSettingsPanel({ folders, onToggleFolder, autonomy, onAutonomy, onBack }) {
  const c = useSPTheme();
  const AUTONOMY_OPTS = [
    { id:'supervised', label:'Supervised', desc:'Confirms before every action' },
    { id:'assisted',   label:'Assisted',   desc:'Confirms before writes, commits & PRs' },
    { id:'autonomous', label:'Autonomous', desc:'Acts without asking' },
  ];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
      <div style={{
        height:40, padding:'0 12px', display:'flex', alignItems:'center', gap:8,
        borderBottom:`1px solid ${c.border}`, flexShrink:0, background:c.bgSub,
      }}>
        <button onClick={onBack} style={{
          background:'none', border:'none', cursor:'pointer', color:c.accent,
          fontSize:SP_T.small, fontFamily:SP_F, display:'flex', alignItems:'center', gap:4, padding:0,
        }}>← Back</button>
        <span style={{ flex:1, textAlign:'center', fontSize:SP_T.label, fontWeight:600, color:c.text }}>Settings</span>
        <div style={{ width:48 }} />
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'14px 12px 24px' }}>

        <div style={{ fontSize:SP_T.meta, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>Autonomy</div>
        <div style={{ fontSize:SP_T.small, color:c.muted, lineHeight:1.5, marginBottom:10 }}>When should the agent ask for confirmation?</div>
        <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:20 }}>
          {AUTONOMY_OPTS.map(opt => {
            const active = autonomy === opt.id;
            return (
              <div key={opt.id} onClick={() => onAutonomy(opt.id)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                borderRadius:6, cursor:'pointer',
                background:active ? c.accentSoft : c.surf,
                border:`1px solid ${active ? c.accentBorder : c.border}`,
                transition:'all .12s',
              }}>
                <div style={{
                  width:14, height:14, borderRadius:'50%', flexShrink:0,
                  border:`1.5px solid ${active ? c.accent : c.border}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {active && <div style={{ width:6, height:6, borderRadius:'50%', background:c.accent }} />}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:SP_T.small, fontWeight:active?600:400, color:active?c.accent:c.text }}>{opt.label}</div>
                  <div style={{ fontSize:SP_T.micro, color:c.muted }}>{opt.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ height:1, background:c.border, marginBottom:16 }} />
        <div style={{ fontSize:SP_T.meta, fontWeight:700, color:c.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>Vault Browser</div>
        <div style={{ fontSize:SP_T.small, color:c.muted, lineHeight:1.5, marginBottom:10 }}>Filter which folders appear in "Add from Vault" and @ search.</div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {folders.map(f => (
            <div key={f.name} style={{
              display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
              background:c.surf, border:`1px solid ${c.border}`, borderRadius:6,
            }}>
              <span style={{ fontSize:SP_T.micro, color:c.muted, flexShrink:0 }}>▾</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:SP_T.small, color:f.enabled?c.text:c.muted, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'color .12s' }}>{f.name}</div>
                <div style={{ fontSize:SP_T.micro, color:c.muted }}>{f.count} {f.count===1?'file':'files'}</div>
              </div>
              <SPToggle on={f.enabled} onChange={() => onToggleFolder(f.name)} />
            </div>
          ))}
        </div>
        <div style={{ marginTop:10, padding:'8px 10px', background:c.surfAlt, borderRadius:6, fontSize:SP_T.meta, color:c.muted, lineHeight:1.5 }}>
          Files already in context are not affected by folder filters.
        </div>
      </div>
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────
Object.assign(window, {
  SP_BASE, SP_T, SP_F, SP_M, makeSPColors, SPThemeCtx, useSPTheme,
  SPHeader, SPContextStrip, SPTabBar, SPToggle, SPSettingsPanel,
  SPUserMsg, SPAgentMsg, SPTypingDots, SPFileCard, SPHintCard,
  SPAtMention, SPFilePicker, SPContextPanel,
});
