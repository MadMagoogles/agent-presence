"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PresenceWidget, ReduceCtx } from "@/components/presence/presence";
import { glassFor } from "@/components/lab/glass";
import { AnimCtx, useAnimSettings } from "@/lib/anim-config";
import { desktopSafe, defaults, type StyleId } from "@/lib/lab-config";
import { useSimulation, type Agent } from "@/lib/engine";
import preset from "@/presets/jacob-2026-11-03.json";
import "./desktop.css";

/** Standalone renderer; no wallpaper, lab panel, or browser position persistence. */
export default function Desktop() {
  const reduce = useReducedMotion() ?? false;
  const anim = useAnimSettings();
  const sim = useSimulation({ playing: false });
  const [active, setActive] = useState<StyleId>("aurora");
  const [hidden, setHidden] = useState(false);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Native drag owns the root cursor until release/finally; restore on unmount too.
  useEffect(() => {
    if (!dragging) return;
    const root = document.documentElement, previous = root.style.cursor;
    root.style.cursor = "grabbing";
    return () => { root.style.cursor = previous; };
  }, [dragging]);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [flare, setFlare] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  // Stay transparent until we know this is a plain browser, so the Tauri window never flashes a backdrop.
  const [webPreview, setWebPreview] = useState(false);
  useEffect(() => { setWebPreview(!isTauri()); }, []);
  const trigger = useRef(sim.trigger); trigger.current = sim.trigger;
  const pill = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressUntil = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>[]>([]);
  const open = hover || focus || pinned;
  const Glass = glassFor[active];
  const cfg = { ...defaults[active], ...preset.styles[active] };
  const animCfg = { ...anim.cfg, handoff: { ...anim.cfg.handoff, enabled: true } };
  const done = sim.s.agents.filter(a => a.status === "done").length;
  useEffect(() => { if (!done) return; setFlare(true); const t = setTimeout(() => setFlare(false), 1400); return () => clearTimeout(t); }, [done]);
  useEffect(() => () => settle.current.forEach(clearTimeout), []);

  // Opt-in recording timeline. Existing manual commands retain their targeting behaviour.
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopDemo = () => { demoTimers.current.forEach(clearTimeout); demoTimers.current = []; };
  useEffect(() => () => demoTimers.current.forEach(clearTimeout), []);
  const playDemo = () => {
    stopDemo(); settle.current.forEach(clearTimeout); settle.current = [];
    setHidden(false); setPinned(false);
    sim.s.agents.forEach(a => sim.setStatus(a.id, "idle"));
    const at = (sec: number, run: () => void) => demoTimers.current.push(setTimeout(run, sec * 1000));
    const state = (sec: number, id: string, status: "working" | "needs" | "done") => at(sec, () => {
      sim.setStatus(id, status, { verb: status === "working" ? "Working on" : status === "needs" ? "Review" : "Finished", target: "demo task", ...(status === "done" ? {output:"Ready for review"} : {}) });
      if (status === "done") at(2.8, () => sim.setStatus(id, "idle"));
    });
    // v3 natural pacing (~2s gaps); times relative to Ctrl+Alt+P. Widget already centered; no drag.
    state(0,"atlas","done"); // red: confetti/check, then idle at 2.8s
    state(3.0,"moss","needs"); // blue: hover/detail at the script's real cursor
    at(8.0,()=>sim.setStatus("moss","idle"));
    state(9.5,"juniper","done"); // white, idle at 12.3s
    state(12.0,"wren","done"); // violet, idle at 14.8s
    at(15.0,()=>sim.s.agents.forEach(a=>sim.setStatus(a.id,"idle")));
  };

  const command = useRef<(action: string) => void>(() => {});
  command.current = action => {
    if (action === "demo") { playDemo(); return; }
    if (action.startsWith("style:")) { const id = action.slice(6) as StyleId; if (desktopSafe.includes(id)) setActive(id); return; }
    if (action === "next" || action === "previous") { setActive(a => desktopSafe[(desktopSafe.indexOf(a) + (action === "next" ? 1 : -1) + 4) % 4]); return; }
    if (action === "toggle") { setHidden(v => !v); setFocus(false); setHover(false); return; }
    if (action === "show") { setHidden(false); return; }
    if (action === "hover") { setPinned(v => !v); return; }
    if (action === "quit") { if (isTauri()) void invoke("quit_app"); return; }
    if (action === "idle") { stopDemo(); sim.s.agents.forEach(a => sim.setStatus(a.id, "idle")); return; }
    if (["working", "complete", "handoff", "needs", "error"].includes(action)) {
      if (action === "complete") {
        // Paused simulation means done does not auto-settle; restore it explicitly for repeatable takes.
        const target = sim.s.agents.find(a => ["working", "needs", "error", "idle"].includes(a.status));
        if (!target) return;
        sim.setStatus(target.id, "done", { verb: "Finished", target: "release notes", output: "Ready for review" });
        settle.current.push(setTimeout(() => sim.setStatus(target.id, "idle"), 2800));
      } else trigger.current(action as "working" | "handoff" | "needs" | "error");
    }
  };

  useEffect(() => {
    let disposed = false; const unlisten: (() => void)[] = [];
    const retain = (f: () => void) => { if (disposed) f(); else unlisten.push(f); };
    if (isTauri()) {
      void listen<string>("desktop-action", e => command.current(e.payload)).then(retain);
      // A click passing through to another app never reaches Radix's document listener.
      // Dismiss any details on native blur instead, without unmounting bots or their animations.
      void getCurrentWindow().onFocusChanged(({ payload }) => {
        if (!payload) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }).then(retain);
    }
    const key = (e: KeyboardEvent) => {
      if (!e.isTrusted || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.repeat || (e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const actions: Record<string, string> = { "1": "style:frosted", "2": "style:dark", "3": "style:iridescent", "4": "style:aurora", "[": "previous", "]": "next", w: "working", c: "complete", m: "handoff", n: "needs", i: "idle", h: "toggle", f: "hover", p: "demo" };
      if (e.key === "Escape") {
        // Esc first closes a bot's details; otherwise quits the app.
        if (document.querySelector('[data-state="open"][role="dialog"]')) return;
        command.current("quit"); return;
      }
      const action = actions[e.key.toLowerCase()]; if (action) { e.preventDefault(); command.current(action); }
    };
    addEventListener("keydown", key);
    return () => { disposed = true; unlisten.forEach(f => f()); removeEventListener("keydown", key); };
  }, []);

  // Native cursor polling toggles whole-window click-through outside these live DOM bounds.
  // Include portalled popovers/tooltips; bubbles/confetti stay visual-only and never eat desktop clicks.
  useEffect(() => {
    if (!isTauri()) return;
    let previous = ""; let busy = false;
    const update = async () => {
      if (busy) return;
      const regions = Array.from(document.querySelectorAll('[data-desktop-pill], [data-desktop-restore], [data-radix-popper-content-wrapper]')).flatMap(el => {
        const r = el.getBoundingClientRect();
        return r.width && r.height ? [{ x: r.x, y: r.y, width: r.width, height: r.height, radius: el.hasAttribute("data-desktop-pill") ? 24 : 8 }] : [];
      });
      const text = JSON.stringify(regions); if (text === previous) return;
      busy = true;
      try { await invoke("set_hit_regions", { regions }); previous = text; } catch (e) { console.warn("Hit-region update failed", e); } finally { busy = false; }
    };
    void update(); const t = setInterval(() => void update(), 33);
    return () => clearInterval(t);
  }, []);

  const pointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-drag]")) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const pointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.moved || !(e.buttons & 1)) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < 4) return;
    setDragging(true); d.moved = true; suppressUntil.current = performance.now() + 200;
    if (isTauri()) {
      // Start only after the threshold so a short click still opens the bot's details.
      suppressUntil.current = Infinity;
      void getCurrentWindow().startDragging().catch(err => { setNotice(`Drag unavailable: ${String(err)}`); }).finally(() => { setDragging(false); suppressUntil.current = performance.now() + 120; });
      drag.current = null;
    } else {
      setPreviewOffset(p => ({ x: p.x + dx, y: p.y + dy }));
      drag.current = { x: e.clientX, y: e.clientY, moved: false };
    }
  };
  const actions = {
    approve: (a: Agent) => sim.setStatus(a.id, "working", { verb: "Continuing", target: a.activity.target }),
    decline: (a: Agent) => sim.setStatus(a.id, "idle"),
    retry: (a: Agent) => sim.setStatus(a.id, "working", { verb: "Retrying", target: a.activity.target }),
  };
  return <ReduceCtx.Provider value={reduce}><AnimCtx.Provider value={animCfg}><MotionConfig reducedMotion={reduce ? "always" : "never"}>
    <main className={"desktop-stage" + (webPreview ? " is-web" : "")} data-desktop-style={active}>
      {webPreview && <p className="desktop-web-note">Browser preview of the native desktop widget. <a href="/">Open the full web demo</a> · <a href="/lab/">Style Lab</a></p>}
      <div className="desktop-anchor" style={{ marginLeft: previewOffset.x, marginTop: previewOffset.y }}>
        <AnimatePresence initial={false}>
          {!hidden && <motion.div key="pill" ref={pill} data-desktop-pill data-overlay data-demo-scale="1.5" data-open={open} role="group" tabIndex={0}
            aria-label="Agent presence. Drag to move. H to hide. Keys 1 through 4 change style."
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
            className="desktop-pill" style={{ cursor: dragging ? "grabbing" : "default" }} onPointerEnter={() => setHover(true)} onPointerLeave={() => { setHover(false); drag.current = null; }}
            onFocus={() => setFocus(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false); }}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }}
            onClickCapture={e => { if (performance.now() < suppressUntil.current) { suppressUntil.current = 0; e.preventDefault(); e.stopPropagation(); } }}>
            <AnimatePresence initial={false}>
              <motion.div key={active} className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <Glass cfg={cfg} open={false} reduce={reduce} agents={sim.s.agents} flare={flare} src={null} />
              </motion.div>
            </AnimatePresence>
            <div className="relative flex items-center">
              <motion.div initial={false} animate={{ paddingLeft: 6 }}><PresenceWidget agents={sim.s.agents} messages={sim.s.messages} onMsgDone={sim.msgDone} actions={actions} /></motion.div>
              <motion.div className="overflow-hidden" initial={false} animate={{ width: 40 }}>
                {open && <button data-no-drag onClick={() => command.current("toggle")} className="desktop-close" style={{ cursor: "inherit" }} title="Hide (H)" aria-label="Hide agents"><X size={16} /></button>}
              </motion.div>
            </div>
          </motion.div>}
        </AnimatePresence>
        {hidden && <button data-desktop-restore className="desktop-restore" onClick={() => command.current("show")}>Show agents</button>}
      </div>
      <p className="sr-only" role="status">{notice || sim.s.announce}</p>
    </main>
  </MotionConfig></AnimCtx.Provider></ReduceCtx.Provider>;
}
