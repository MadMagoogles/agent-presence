"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { PanelRightOpen } from "lucide-react";
import { PresenceWidget, ReduceCtx } from "@/components/presence/presence";
import { FloatingOverlay } from "@/components/presence/overlay";
import { useSimulation, type Agent } from "@/lib/engine";
import { AnimCtx, useAnimSettings } from "@/lib/anim-config";
import { defaults, DEMO_SCALES, desktopSafe, SAFE_KEY, SCALE_KEY, LAB_KEY, styles, type DemoScale, type LabCfg, type StyleId, type Val } from "@/lib/lab-config";
import { drawBackdrop, type BackdropId } from "@/lib/backdrops";
import { glassFor } from "@/components/lab/glass";
import { LabPanel } from "@/components/lab/panel";

function Lab() {
  const q = useSearchParams();
  const system = useReducedMotion() ?? false;
  const [forced, setForced] = useState(q.get("rm") === "1");
  const reduce = forced || system;
  const sim = useSimulation({ playing: q.get("still") !== "1" });
  const anim = useAnimSettings();
  const animCfg = { ...anim.cfg, handoff: { ...anim.cfg.handoff, enabled: true } }; // the lab always shows the message bubble
  const [active, setActive] = useState<StyleId>((styles.find(s => s.id === q.get("style"))?.id) ?? "frosted");
  const [cfg, setCfg] = useState<LabCfg>(defaults);
  const [backdrop, setBackdrop] = useState<BackdropId>("busy");
  const [panel, setPanel] = useState(true);
  const [safeOnly, setSafeOnlyRaw] = useState(true);
  const [safeLoaded, setSafeLoaded] = useState(false);
  useEffect(() => { if (localStorage.getItem(SAFE_KEY) === "0") setSafeOnlyRaw(false); setSafeLoaded(true); }, []);
  const allowed = safeOnly ? styles.filter(s => desktopSafe.includes(s.id)) : styles;
  const setSafeOnly = (v: boolean) => { setSafeOnlyRaw(v); localStorage.setItem(SAFE_KEY, v ? "1" : "0"); setNote(v ? "Desktop-safe styles only: 4 styles" : "All 6 styles available"); };
  useEffect(() => { if (safeLoaded && safeOnly && !desktopSafe.includes(active)) setActive("frosted"); }, [safeLoaded, safeOnly, active]);
  const [tri, setTri] = useState<"violet" | "black">(q.get("tri") === "black" ? "black" : "violet");
  const parseScale = (v: string | null): DemoScale | null => { const n = Number(v); return (DEMO_SCALES as readonly number[]).includes(n) ? n as DemoScale : null; };
  const [scale, setScaleRaw] = useState<DemoScale>(() => parseScale(q.get("scale")) ?? 1);
  const [scaleLoaded, setScaleLoaded] = useState(!!q.get("scale"));
  useEffect(() => { if (q.get("scale")) return; const s = parseScale(localStorage.getItem(SCALE_KEY)); if (s) setScaleRaw(s); setScaleLoaded(true); }, [q]);
  const setScale = (v: DemoScale) => { setScaleRaw(v); localStorage.setItem(SCALE_KEY, String(v)); setNote(`Demo scale ${v}×`); };
  // fallback triangle: black body, white eyes
  const agents = sim.s.agents.map(a => a.shape === "tri" && tri === "black" ? { ...a, hue: "#0b0b0e", eye: "#ffffff" } : a);
  const [pinned, setPinned] = useState(false);
  const [flare, setFlare] = useState(false);
  const [note, setNote] = useState("");
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(LAB_KEY) ?? "null");
    if (s) { setCfg(Object.fromEntries(styles.map(({ id }) => [id, { ...defaults[id], ...s.styles?.[id] }])) as LabCfg); if (s.backdrop) setBackdrop(s.backdrop); if (s.tri === "black" && !q.get("tri")) setTri("black"); if (s.active && !q.get("style")) setActive(s.active); if (!q.get("scale") && parseScale(String(s.scale ?? "")) ) setScaleRaw(s.scale); } } catch {} }, [q]);

  // draw the backdrop once per kind/resize; it is both the wallpaper and the shader texture
  useEffect(() => {
    let t = 0;
    const paint = () => { const c = drawBackdrop(backdrop, innerWidth, innerHeight, Math.min(1.5, devicePixelRatio || 1));
      c.className = "absolute inset-0 size-full"; c.setAttribute("aria-hidden", "true"); holder.current?.replaceChildren(c); setSrc(c); };
    paint(); const onR = () => { clearTimeout(t); t = window.setTimeout(paint, 150); };
    addEventListener("resize", onR); return () => { removeEventListener("resize", onR); clearTimeout(t); };
  }, [backdrop]);

  // flare the iridescent edge whenever a bot newly completes
  const doneCount = sim.s.agents.filter(a => a.status === "done").length; const prevDone = useRef(doneCount);
  useEffect(() => { if (doneCount > prevDone.current) { setFlare(true); const t = setTimeout(() => setFlare(false), 1400); prevDone.current = doneCount; return () => clearTimeout(t); } prevDone.current = doneCount; }, [doneCount]);

  const set = (s: StyleId, k: string, v: Val) => setCfg(c => ({ ...c, [s]: { ...c[s], [k]: v } }));
  const reset = (s: StyleId) => { setCfg(c => ({ ...c, [s]: defaults[s] })); setNote(`${styles.find(x => x.id === s)!.name} reset to defaults`); };
  const snapshot = useCallback(() => ({ active, backdrop, tri, scale, styles: cfg }), [active, backdrop, tri, scale, cfg]);
  const onEvent = (e: "complete" | "handoff" | "needs" | "working" | "hover") => { if (e === "hover") { setPinned(p => !p); return; } sim.trigger(e); };
  const onCopy = async () => { try { await navigator.clipboard.writeText(JSON.stringify(snapshot(), null, 2)); setNote("Settings copied as JSON"); return true; } catch { setNote("Clipboard unavailable"); return false; } };
  const onSave = () => { localStorage.setItem(LAB_KEY, JSON.stringify(snapshot())); setNote("Settings saved in this browser"); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement).closest("input,select,textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "\\") setPanel(p => !p);
      const ids = allowedRef.current.map(s => s.id); const k = Number(e.key);
      if (k >= 1 && k <= ids.length) setActive(ids[k - 1]);
      if (e.key === "[" || e.key === "]") setActive(a => ids[(ids.indexOf(a) + (e.key === "]" ? 1 : -1) + ids.length) % ids.length] ?? ids[0]); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);

  const allowedRef = useRef(allowed); allowedRef.current = allowed;
  const actions = {
    approve: (a: Agent) => sim.setStatus(a.id, "working", { verb: "Continuing", target: a.activity.target }, `Approved. ${a.name} is continuing`),
    decline: (a: Agent) => sim.setStatus(a.id, "idle", undefined, `Declined. ${a.name} stopped`),
    retry: (a: Agent) => sim.setStatus(a.id, "working", { verb: "Retrying", target: a.activity.target }),
  };
  const Glass = glassFor[active];

  return (
    <ReduceCtx.Provider value={reduce}>
      <AnimCtx.Provider value={animCfg}>
        <MotionConfig reducedMotion={reduce ? "always" : "never"}>
          <main className="relative h-screen min-h-[560px] overflow-hidden" data-lab-style={active} data-backdrop={backdrop} data-demo-scale={scale} data-scale-loaded={scaleLoaded || undefined}>
            <div ref={holder} className="absolute inset-0" />
            <h2 className="sr-only">Desktop preview</h2>
            <FloatingOverlay agents={agents} onAnnounce={setNote} forceOpen={pinned} scale={scale}
              glass={open => <Glass cfg={cfg[active]} open={open} reduce={reduce} agents={agents} flare={flare} src={src} />}>
              <PresenceWidget agents={agents} messages={sim.s.messages} onMsgDone={sim.msgDone} actions={actions} />
            </FloatingOverlay>
            <p role="status" aria-live="polite" className="sr-only">{sim.s.announce}</p>
            <p role="status" aria-live="polite" data-overlay-status className="sr-only">{note}</p>
          </main>
          <AnimatePresence initial={false}>
            {panel ? <motion.div key="p" initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ type: "spring", stiffness: 420, damping: 40 }} className="fixed inset-y-0 right-0 z-40">
              <LabPanel active={active} setActive={setActive} cfg={cfg} set={set} reset={reset} backdrop={backdrop} setBackdrop={setBackdrop} safeOnly={safeOnly} setSafeOnly={setSafeOnly} tri={tri} setTri={setTri} scale={scale} setScale={setScale} hoverPinned={pinned}
                onEvent={onEvent} onCopy={onCopy} onSave={onSave} onCollapse={() => setPanel(false)} reduce={reduce} system={system} setReduce={setForced} />
            </motion.div>
            : <motion.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }} whileHover={{ opacity: 1 }} onClick={() => setPanel(true)} data-open-panel
                aria-label="Open Style Lab panel" title="Open panel (\\)" className="fixed top-4 right-4 z-40 rounded-lg border border-line bg-surface p-2 text-fg-2 shadow-lg">
                <PanelRightOpen className="size-5" aria-hidden /></motion.button>}
          </AnimatePresence>
        </MotionConfig>
      </AnimCtx.Provider>
    </ReduceCtx.Provider>
  );
}
export default function Page() { return <Suspense><Lab /></Suspense>; }
