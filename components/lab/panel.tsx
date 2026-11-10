"use client";
import { useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, MessageSquare, BellRing, MousePointer2, RotateCcw, Copy, Check, Save, PanelRightClose, Bot } from "lucide-react";
import { DEMO_SCALES, desktopSafe, styles, type DemoScale, type Field, type LabCfg, type StyleId, type Val } from "@/lib/lab-config";
import { backdrops, type BackdropId } from "@/lib/backdrops";

export interface PanelProps {
  active: StyleId; setActive: (s: StyleId) => void; cfg: LabCfg; set: (s: StyleId, k: string, v: Val) => void; reset: (s: StyleId) => void;
  backdrop: BackdropId; setBackdrop: (b: BackdropId) => void; safeOnly: boolean; setSafeOnly: (v: boolean) => void; tri: "violet" | "black"; setTri: (t: "violet" | "black") => void; scale: DemoScale; setScale: (s: DemoScale) => void; hoverPinned: boolean;
  onEvent: (e: "complete" | "handoff" | "needs" | "working" | "hover") => void; onCopy: () => Promise<boolean>; onSave: () => void; onCollapse: () => void;
  reduce: boolean; system: boolean; setReduce: (v: boolean) => void;
}
const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-fg-2 shadow-xs hover:bg-surface-2";

function Control({ f, v, onChange, id }: { f: Field; v: Val; onChange: (v: Val) => void; id: string }) {
  if (f.type === "range") return (
    <div>
      <div className="flex items-baseline justify-between"><label htmlFor={id} className="text-sm font-medium text-fg-2">{f.label}</label>
        <output htmlFor={id} className="text-xs tabular-nums text-fg-3">{Number(v).toFixed(f.step < 0.1 ? 2 : f.step < 1 ? 1 : 0)}{f.unit ?? ""}</output></div>
      <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={Number(v)} onChange={e => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-bg-brand-solid)]" />
    </div>);
  if (f.type === "color") return (
    <div className="flex items-center justify-between"><label htmlFor={id} className="text-sm font-medium text-fg-2">{f.label}</label>
      <span className="flex items-center gap-2"><span className="font-mono text-xs text-fg-3">{String(v)}</span>
        <input id={id} type="color" value={String(v)} onChange={e => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5" /></span>
    </div>);
  if (f.type === "select") return (
    <div><label htmlFor={id} className="text-sm font-medium text-fg-2">{f.label}</label>
      <select id={id} value={String(v)} onChange={e => onChange(e.target.value)} className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg shadow-xs">
        {f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>);
  return (
    <div className="flex items-start justify-between gap-3">
      <div><label htmlFor={id} className="text-sm font-medium text-fg-2">{f.label}</label>{f.hint && <p id={`${id}-h`} className="text-xs text-fg-3">{f.hint}</p>}</div>
      <button id={id} role="switch" aria-checked={!!v} aria-describedby={f.hint ? `${id}-h` : undefined} onClick={() => onChange(!v)}
        className={clsx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-150", v ? "bg-brand" : "bg-surface-3")}>
        <span className={clsx("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-150", v && "translate-x-5")} />
      </button>
    </div>);
}

export function LabPanel(p: PanelProps) {
  const [copied, setCopied] = useState(false); const [saved, setSaved] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const def = styles.find(s => s.id === p.active)!;
  const ok = (id: StyleId) => !p.safeOnly || desktopSafe.includes(id);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key] ?? 0; let j = e.key === "Home" ? 0 : e.key === "End" ? styles.length - 1 : d ? i + d : -1;
    if (j < 0 && !d) return; e.preventDefault();
    const n = styles.length; j = (j + n) % n; if (d) { while (!ok(styles[j].id)) j = (j + d + n) % n; } else if (!ok(styles[j].id)) return;
    p.setActive(styles[j].id); tabs.current[j]?.focus();
  };
  return (
    <aside aria-label="Style Lab controls" className="fixed top-0 right-0 z-40 flex h-full w-[340px] flex-col border-l border-line bg-surface text-fg shadow-xl">
      <header className="flex items-start justify-between border-b border-line px-5 pt-5 pb-4">
        <div><h1 className="text-lg font-semibold">Style Lab</h1><p className="text-sm text-fg-3">Agent Presence overlay · glass experiments</p></div>
        <button onClick={p.onCollapse} aria-label="Collapse panel" title="Collapse panel (\\)" className="rounded-lg p-2 text-fg-3 hover:bg-surface-2"><PanelRightClose className="size-5" aria-hidden /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div role="tablist" aria-label="Glass style" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
          {styles.map((s, i) => <button key={s.id} ref={el => { tabs.current[i] = el; }} role="tab" id={`tab-${s.id}`} aria-controls="lab-tabpanel" aria-selected={p.active === s.id} tabIndex={p.active === s.id ? 0 : -1}
            aria-disabled={!ok(s.id) || undefined} aria-describedby={!ok(s.id) ? "browser-only-note" : undefined} title={!ok(s.id) ? "Browser only, needs the backdrop image." : `${s.name} (${i + 1})`}
            onClick={() => ok(s.id) && p.setActive(s.id)} onKeyDown={e => onTabKey(e, i)}
            className={clsx("rounded-md px-2 py-1.5 text-left text-sm font-semibold", !ok(s.id) ? "cursor-not-allowed text-fg-3 line-through decoration-1 opacity-70" : p.active === s.id ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg-2")}>{s.name}</button>)}
        </div>
        <div className="mt-3"><Control id="safe-only" f={{ key: "safe", label: "Desktop-safe styles only", type: "toggle", hint: p.safeOnly ? "Keys 1–4 and [ ] cycle the four desktop looks." : "Keys 1–6 and [ ] cycle all six looks." }} v={p.safeOnly} onChange={v => p.setSafeOnly(!!v)} /></div>
        {p.safeOnly && <p id="browser-only-note" className="mt-2 text-xs text-fg-3">Pixel / dither and Refraction lens: Browser only, needs the backdrop image.</p>}
        <section role="tabpanel" id="lab-tabpanel" aria-labelledby={`tab-${p.active}`} className="mt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-fg-3">{def.blurb}</p>
            <button onClick={() => p.reset(p.active)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-fg-2 hover:bg-surface-2"><RotateCcw className="size-4" aria-hidden />Reset</button>
          </div>
          <div className="mt-4 space-y-4">{def.fields.map(f => <Control key={`${p.active}-${f.key}`} id={`f-${p.active}-${f.key}`} f={f} v={p.cfg[p.active][f.key]} onChange={v => p.set(p.active, f.key, v)} />)}</div>
        </section>

        <h2 className="mt-6 text-xs font-semibold tracking-wide text-fg-3 uppercase">Demo events</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={btn} onClick={() => p.onEvent("complete")}><CheckCircle2 className="size-4" aria-hidden />Task complete</button>
          <button className={btn} onClick={() => p.onEvent("handoff")}><MessageSquare className="size-4" aria-hidden />Message</button>
          <button className={btn} onClick={() => p.onEvent("needs")}><BellRing className="size-4" aria-hidden />Needs you</button>
          <button className={btn} onClick={() => p.onEvent("working")}><Bot className="size-4" aria-hidden />Working</button>
          <button className={clsx(btn, "col-span-2", p.hoverPinned && "border-brand text-[var(--color-text-brand-secondary)]")} aria-pressed={p.hoverPinned} onClick={() => p.onEvent("hover")}><MousePointer2 className="size-4" aria-hidden />Hover state {p.hoverPinned ? "pinned" : "off"}</button>
        </div>

        <h2 className="mt-6 text-xs font-semibold tracking-wide text-fg-3 uppercase" id="bd-label">Backdrop</h2>
        <div role="radiogroup" aria-labelledby="bd-label" className="mt-2 flex gap-1 rounded-lg bg-surface-2 p-1">
          {backdrops.map(([k, l]) => <button key={k} role="radio" aria-checked={p.backdrop === k} onClick={() => p.setBackdrop(k)}
            className={clsx("flex-1 rounded-md px-2 py-1.5 text-sm font-semibold", p.backdrop === k ? "bg-surface text-fg shadow-sm" : "text-fg-3")}>{l}</button>)}
        </div>
        <h2 className="mt-6 text-xs font-semibold tracking-wide text-fg-3 uppercase" id="tri-label">Triangle bot color</h2>
        <div role="radiogroup" aria-labelledby="tri-label" className="mt-2 flex gap-1 rounded-lg bg-surface-2 p-1">
          {([["violet", "Violet"], ["black", "Black"]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={p.tri === k} onClick={() => p.setTri(k)}
            className={clsx("flex-1 rounded-md px-2 py-1.5 text-sm font-semibold", p.tri === k ? "bg-surface text-fg shadow-sm" : "text-fg-3")}>{l}</button>)}
        </div>
        <h2 className="mt-6 text-xs font-semibold tracking-wide text-fg-3 uppercase" id="scale-label">Demo scale</h2>
        <div role="radiogroup" aria-labelledby="scale-label" className="mt-2 flex gap-1 rounded-lg bg-surface-2 p-1">
          {DEMO_SCALES.map(s => <button key={s} role="radio" aria-checked={p.scale === s} onClick={() => p.setScale(s)}
            className={clsx("flex-1 rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums", p.scale === s ? "bg-surface text-fg shadow-sm" : "text-fg-3")}>{s}×</button>)}
        </div>
        <p className="mt-2 text-xs text-fg-3">Scales the whole overlay for recordings. Drag still works. ?scale= in the URL.</p>
        <label className="mt-3 flex items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" checked={p.reduce} disabled={p.system} onChange={e => p.setReduce(e.target.checked)} className="size-4 accent-[var(--color-bg-brand-solid)]" />Reduced motion{p.system ? " (system)" : ""}
        </label>
      </div>
      <footer className="grid grid-cols-2 gap-2 border-t border-line px-5 py-4">
        <button className={btn} onClick={async () => { if (await p.onCopy()) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copied" : "Copy JSON"}</button>
        <button className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[var(--color-bg-brand-solid_hover)]" onClick={() => { p.onSave(); setSaved(true); setTimeout(() => setSaved(false), 1400); }}>
          {saved ? <Check className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />}{saved ? "Saved" : "Save"}</button>
      </footer>
    </aside>
  );
}
