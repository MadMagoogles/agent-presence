"use client";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AgentAvatar, useReduceMotion } from "@/components/presence/presence";
import type { Agent } from "@/lib/engine";
import { useAnim } from "@/lib/anim-config";

const KEY = "agent-overlay-pos";
const THRESHOLD = 4; // px before a press becomes a drag, so clicks still open bot popovers
const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const; // ~250ms settle
const CLOSE_W = 40; // unscaled close-button slot; 0 at rest so the pill hugs the bots
const CLOSE_EASE = { duration: 0.2, ease: "easeOut" } as const;
const EDGE_M = 8;
const MOBILE_MQ = "(max-width: 767px)";
type Pos = { x: number; y: number };

export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/**
 * Floating, draggable, hideable shell around the presence strip.
 * Default: the pill hugs the bots. Hover / keyboard focus (:focus-visible) / drag: expand ~200ms ease-out to reveal ×.
 * Mouse or programmatic focus alone does not expand, so a drag or a reopen after close can collapse again.
 * If there isn't room to grow right, the pill anchors its right edge and grows left (× on the left).
 * On mobile (<768px) the shell is pinned in its parent: not draggable, not closable.
 */
/** `glass` swaps the default pill surface (Style Lab); `forceOpen` pins the hover state for demos. */
export function FloatingOverlay({ agents, children, onAnnounce, glass, forceOpen = false, scale = 1 }: { agents: Agent[]; children: ReactNode; onAnnounce: (m: string) => void; glass?: (open: boolean) => ReactNode; forceOpen?: boolean; /** Demo / recording scale; CSS transform so drag still works. Stroke scales with it. */ scale?: number }) {
  const reduce = useReduceMotion();
  const pinned = useIsMobile();
  const n = useAnim().needs;
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [expandLeft, setExpandLeft] = useState(false);
  const closeW = useMotionValue(0);
  const leftMv = useMotionValue(-9999);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (!dragging) return;
    const root = document.documentElement, previous = root.style.cursor;
    root.style.cursor = "grabbing";
    return () => { root.style.cursor = previous; };
  }, [dragging]);
  useEffect(() => { if (pinned) { setHidden(false); setDragging(false); drag.current = null; } }, [pinned]);
  const open = hover || focusIn || dragging || forceOpen;
  const needsYou = agents.some(a => a.status === "needs" || a.status === "error");

  const restSize = useCallback(() => {
    const content = contentRef.current, el = ref.current;
    return { w: content?.offsetWidth ?? el?.offsetWidth ?? 232, h: el?.offsetHeight ?? 60 };
  }, []);

  useLayoutEffect(() => {
    const target = !pinned && open ? CLOSE_W : 0;
    if (reduce) { closeW.set(target); return; }
    const ctrl = animate(closeW, target, CLOSE_EASE);
    return () => ctrl.stop();
  }, [open, pinned, reduce, closeW]);

  // `pos` is always the hugged (collapsed) top-left. When expanding left, shift CSS left
  // by the *visual* close width (slot × scale) so the bots stay put and the right edge is anchored.
  useLayoutEffect(() => {
    if (!pos) { leftMv.set(-9999); return; }
    const apply = (w: number) => leftMv.set(pos.x - (expandLeft ? w * scale : 0));
    apply(closeW.get());
    return closeW.on("change", apply);
  }, [pos, expandLeft, scale, closeW, leftMv]);

  const clamp = useCallback((p: Pos): Pos => {
    // layout box is unscaled; visual size is rest-size*scale (transform-origin top left)
    const { w: rw, h: rh } = restSize();
    const w = rw * scale, h = rh * scale, m = EDGE_M;
    return { x: Math.min(Math.max(m, p.x), window.innerWidth - w - m), y: Math.min(Math.max(m, p.y), window.innerHeight - h - m) };
  }, [scale, restSize]);
  const scaleRef = useRef(scale);
  const inited = useRef(false);

  // initial position: saved, else top centre (using the visual, scaled width)
  useLayoutEffect(() => {
    if (pinned) return;
    if (!inited.current) {
      inited.current = true;
      let p: Pos | null = null;
      try { p = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch {}
      const w = restSize().w * scale;
      setPos(clamp(p ?? { x: (window.innerWidth - w) / 2, y: 96 }));
    }
    const onResize = () => setPos(q => q && clamp(q));
    window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize);
  }, [clamp, scale, pinned]);

  // Keep the visual centre anchored when S/M/L (or lab) scale changes.
  useLayoutEffect(() => {
    if (pinned) return;
    const prev = scaleRef.current;
    if (prev === scale) return;
    scaleRef.current = scale;
    setPos(q => {
      if (!q) return q;
      const { w: uw, h: uh } = restSize();
      const cx = q.x + (uw * prev) / 2, cy = q.y + (uh * prev) / 2;
      return clamp({ x: cx - (uw * scale) / 2, y: cy - (uh * scale) / 2 });
    });
  }, [scale, clamp, pinned, restSize]);

  // Recompute grow direction from the hugged position after drag, reset, and resize.
  useLayoutEffect(() => {
    if (pinned || !pos) { setExpandLeft(false); return; }
    const need = CLOSE_W * scale;
    const roomRight = window.innerWidth - EDGE_M - (pos.x + restSize().w * scale);
    setExpandLeft(roomRight < need);
  }, [pinned, pos, scale, restSize]);

  const commit = (p: Pos) => { const c = clamp(p); setPos(c); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} return c; };

  const onPointerDown = (e: React.PointerEvent) => {
    if (pinned || e.button !== 0 || !pos) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pinned) return;
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); ref.current?.setPointerCapture(e.pointerId); }
    setPos(clamp({ x: d.ox + dx, y: d.oy + dy }));
  };
  const pointerOverOverlay = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  // Mouse focus must not keep the pill expanded. Only :focus-visible (keyboard) counts.
  const syncKeyboardFocus = () => {
    const el = ref.current;
    const active = document.activeElement as HTMLElement | null;
    setFocusIn(!!(el && active && el.contains(active) && active.matches(":focus-visible")));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (pinned) return;
    const d = drag.current; drag.current = null;
    if (d?.moved) { suppressClick.current = true; setDragging(false); commit({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }); }
    // Pointer capture can skip pointerleave during a drag, so clear hover if the release is off the pill.
    setHover(pointerOverOverlay(e));
  };
  const onClickCapture = (e: React.MouseEvent) => { if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); } };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (pinned || e.target !== ref.current || !pos) return;
    const step = e.shiftKey ? 48 : 8;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
    if (!d) return; e.preventDefault();
    const c = commit({ x: pos.x + d[0], y: pos.y + d[1] });
    onAnnounce(`Agents overlay moved to ${Math.round(c.x)}, ${Math.round(c.y)}`);
  };

  const resetExpand = () => { setHover(false); setFocusIn(false); setDragging(false); drag.current = null; closeW.set(0); };
  const hide = () => { if (pinned) return; resetExpand(); setHidden(true); onAnnounce("Agents overlay hidden. Press Alt+Shift+A or use Show agents to bring it back."); requestAnimationFrame(() => chipRef.current?.focus()); };
  const show = () => { resetExpand(); setHidden(false); onAnnounce("Agents overlay shown"); setTimeout(() => ref.current?.focus(), 30); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (pinned) return; if (e.altKey && e.shiftKey && e.code === "KeyA") { e.preventDefault(); hidden ? show() : hide(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  return (
    <>
      <AnimatePresence>
        {(!hidden || pinned) && (
          <motion.div key="overlay" ref={ref} role="group" tabIndex={0} data-overlay data-open={open} data-expand-left={expandLeft ? "true" : "false"} data-demo-scale={scale} data-pinned={pinned ? "true" : "false"}
            aria-label={pinned ? "Agents overlay" : "Agents overlay. Drag to move, or use arrow keys while focused (Shift for bigger steps). Alt+Shift+A hides it."}
            className={pinned
              ? "relative z-30 select-none rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              : "fixed z-30 touch-none select-none rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"}
            style={pinned
              ? { position: "relative", left: "auto", top: "auto", visibility: "visible", transformOrigin: "center center", cursor: "default" }
              : { left: leftMv, top: pos?.y ?? 96, cursor: dragging ? "grabbing" : "default", visibility: pos ? "visible" : "hidden",
                  transformOrigin: "top left", // demo scale + drag pop share one origin so clamp math stays simple
                }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 * scale, y: -6 }}
            animate={{ opacity: 1, scale: (dragging && !reduce ? 1.02 : 1) * scale, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 0.92 * scale, y: -8, filter: "blur(4px)", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={spring}
            onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
            onFocus={() => requestAnimationFrame(syncKeyboardFocus)} onBlur={() => requestAnimationFrame(syncKeyboardFocus)}
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
            <div className={`relative flex items-center ${expandLeft ? "flex-row-reverse" : ""}`}>
              <div ref={contentRef} className="pl-1.5">{children}</div>
              {!pinned && (
                <motion.div initial={false} className="overflow-hidden" style={{ width: closeW }}>
                  <button data-no-drag data-close-overlay type="button" onClick={hide} aria-label="Hide agents overlay"
                    tabIndex={open ? 0 : -1} aria-hidden={!open} inert={!open}
                    className={`flex size-7 shrink-0 cursor-[inherit] items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70 ${expandLeft ? "mr-1 ml-2" : "ml-1"}`}>
                    <X className="size-4" strokeWidth={2} aria-hidden />
                  </button>
                </motion.div>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hidden && !pinned && (
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
