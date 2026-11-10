"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AgentAvatar, useReduceMotion } from "@/components/presence/presence";
import type { Agent } from "@/lib/engine";
import { useAnim } from "@/lib/anim-config";

const KEY = "agent-overlay-pos";
const THRESHOLD = 4; // px before a press becomes a drag, so clicks still open bot popovers
const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const; // ~250ms settle
type Pos = { x: number; y: number };

/**
 * Floating, draggable, hideable shell around the presence strip.
 * Default: near-invisible dark pill. Hover / focus-within: only reveal × with the existing width transition.
 */
/** `glass` swaps the default pill surface (Style Lab); `forceOpen` pins the hover state for demos. */
export function FloatingOverlay({ agents, children, onAnnounce, glass, forceOpen = false, scale = 1 }: { agents: Agent[]; children: ReactNode; onAnnounce: (m: string) => void; glass?: (open: boolean) => ReactNode; forceOpen?: boolean; /** Demo / recording scale; CSS transform so drag still works. Stroke scales with it. */ scale?: number }) {
  const reduce = useReduceMotion();
  const n = useAnim().needs;
  const ref = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (!dragging) return;
    const root = document.documentElement, previous = root.style.cursor;
    root.style.cursor = "grabbing";
    return () => { root.style.cursor = previous; };
  }, [dragging]);
  const open = hover || focusIn || dragging || forceOpen;
  const needsYou = agents.some(a => a.status === "needs" || a.status === "error");

  const clamp = useCallback((p: Pos): Pos => {
    // layout box is unscaled; visual size is offset*scale (transform-origin top left)
    const el = ref.current; const w = (el?.offsetWidth ?? 240) * scale, h = (el?.offsetHeight ?? 60) * scale, m = 8;
    return { x: Math.min(Math.max(m, p.x), window.innerWidth - w - m), y: Math.min(Math.max(m, p.y), window.innerHeight - h - m) };
  }, [scale]);

  // initial position: saved, else top centre
  useLayoutEffect(() => {
    let p: Pos | null = null;
    try { p = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch {}
    const w = ref.current?.offsetWidth ?? 232;
    setPos(clamp(p ?? { x: (window.innerWidth - w) / 2, y: 96 }));
    const onResize = () => setPos(q => q && clamp(q));
    window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize);
  }, [clamp]);
  const commit = (p: Pos) => { const c = clamp(p); setPos(c); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} return c; };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !pos) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); ref.current?.setPointerCapture(e.pointerId); }
    setPos(clamp({ x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (d.moved) { suppressClick.current = true; setDragging(false); commit({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }); }
  };
  const onClickCapture = (e: React.MouseEvent) => { if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); } };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== ref.current || !pos) return;
    const step = e.shiftKey ? 48 : 8;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
    if (!d) return; e.preventDefault();
    const c = commit({ x: pos.x + d[0], y: pos.y + d[1] });
    onAnnounce(`Agents overlay moved to ${Math.round(c.x)}, ${Math.round(c.y)}`);
  };

  const hide = () => { setHidden(true); setHover(false); setFocusIn(false); onAnnounce("Agents overlay hidden. Press Alt+Shift+A or use Show agents to bring it back."); requestAnimationFrame(() => chipRef.current?.focus()); };
  const show = () => { setHidden(false); onAnnounce("Agents overlay shown"); setTimeout(() => ref.current?.focus(), 30); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.altKey && e.shiftKey && e.code === "KeyA") { e.preventDefault(); hidden ? show() : hide(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  return (
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.div key="overlay" ref={ref} role="group" tabIndex={0} data-overlay data-open={open} data-demo-scale={scale}
            aria-label="Agents overlay. Drag to move, or use arrow keys while focused (Shift for bigger steps). Alt+Shift+A hides it."
            className="fixed z-30 touch-none select-none rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? 96, cursor: dragging ? "grabbing" : "default", visibility: pos ? "visible" : "hidden",
              transformOrigin: "top left", // demo scale + drag pop share one origin so clamp math stays simple
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 * scale, y: -6 }}
            animate={{ opacity: 1, scale: (dragging && !reduce ? 1.02 : 1) * scale, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 0.92 * scale, y: -8, filter: "blur(4px)", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={spring}
            onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
            onFocus={() => setFocusIn(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusIn(false); }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onClickCapture={onClickCapture} onKeyDown={onKeyDown}>
            {glass ? glass(false) : <>
            {/* the glass: near-invisible by default, frostier on hover */}
            <motion.div aria-hidden="true" className="absolute inset-0 rounded-2xl border"
              initial={false}
              animate={{ backgroundColor: "rgba(14,14,18,0.22)", borderColor: "rgba(255,255,255,0.09)",
                backdropFilter: "blur(3px) saturate(1)", boxShadow: "0 0 0 rgba(0,0,0,0)" }}
              transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.2, 0, 0, 1] }} />
            </>}
            <div className="relative flex items-center">
              <motion.div initial={false} animate={{ paddingLeft: 6 }} transition={reduce ? { duration: 0 } : spring}>{children}</motion.div>
              <motion.div initial={false} className="overflow-hidden" animate={{ width: 40 }} transition={reduce ? { duration: 0 } : spring}>
                <AnimatePresence>
                  {open && <motion.button key="x" data-no-drag type="button" onClick={hide} aria-label="Hide agents overlay"
                    initial={{ opacity: 0, scale: reduce ? 1 : 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.6 }} transition={{ duration: 0.18 }}
                    className="ml-1 flex size-7 cursor-[inherit] items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70">
                    <X className="size-4" strokeWidth={2} aria-hidden />
                  </motion.button>}
                </AnimatePresence>
              </motion.div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hidden && (
          <motion.button key="chip" ref={chipRef} type="button" onClick={show} data-restore data-needs={needsYou}
            aria-label={`Show agents${needsYou ? ", an agent needs you" : ""} (Alt+Shift+A)`}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 8 }} transition={reduce ? { duration: 0.1 } : spring}
            className="fixed right-4 bottom-4 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#18181d]/80 py-1.5 pr-3 pl-2 text-xs font-medium text-white/85 backdrop-blur-md hover:bg-[#26262d] focus-visible:outline-2 focus-visible:outline-white/70">
            <span className="relative flex -space-x-1.5">
              {agents.map(a => <span key={a.id} className="inline-flex"><AgentAvatar agent={a} size={16} /></span>)}
              {needsYou && <motion.span aria-hidden="true" className="absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #fbbf24" }}
                animate={reduce || !n.enabled ? { opacity: 0.9 } : { opacity: [0.9, 0], scale: [0.95, 1.25] }}
                transition={reduce || !n.enabled ? { duration: 0.2 } : { duration: n.ringDuration, repeat: Infinity, repeatDelay: Math.max(0, n.every - n.ringDuration), ease: "easeOut" }} />}
            </span>
            Show agents
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

export const resetOverlayPosition = () => { try { localStorage.removeItem(KEY); } catch {} location.reload(); };
