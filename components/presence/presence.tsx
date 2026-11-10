"use client";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { createContext, useContext, useEffect, useMemo, useState, useId } from "react";
import { Check, X, Mail } from "lucide-react";
import { ToolCallCard } from "@/components/agent/tool-call-card";
import { type Agent, type AgentStatus, type Message, statusLabel, toolStatus } from "@/lib/engine";
import { useAnim } from "@/lib/anim-config";

export const ReduceCtx = createContext(false);
const useReduce = () => useContext(ReduceCtx);
export const useReduceMotion = useReduce;
/** Figma A: (0,8), blur16, spread-2, black24%; B: (0,4), blur8, spread-1, black20%.
 * SVG blur is sigma = Figma blur / 2. SVG values are converted from CSS px;
 * parent demo transforms scale the complete effect once, along with the bots. */
const BADGE_OUTER_PX = 1.5;

export const SLOT = 44, GAP = 8, PAD = 8;
const cx = (i: number) => PAD + i * (SLOT + GAP) + SLOT / 2;

// tuned for a dark translucent overlay: brighter status colors, analogous tonal badge outlines
const tone: Record<AgentStatus, string> = { idle: "#5b5b63", working: "#8fb4ff", needs: "#fbbf24", done: "#22c55e", error: "#f97066" };
// Untitled UI 900 shades (error background uses error-400 for >=3:1).
const badgeInk: Record<AgentStatus, string> = { idle: "#344054", working: "#194185", needs: "#7a2e0e", done: "#074d31", error: "#7a271a" };


/** Idle-but-busy eyes: glance somewhere new every so often, blink now and then. */
function useGaze(on: boolean, every: number, range: number, blinkEvery: number) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!on) { setLook({ x: 0, y: 0 }); return; }
    let t = 0;
    const next = () => {
      const a = Math.random() * Math.PI * 2, r = range * (0.5 + Math.random() * 0.5);
      setLook(Math.random() < 0.2 ? { x: 0, y: 0 } : { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6 });
      t = window.setTimeout(next, every * 1000 * (0.6 + Math.random() * 0.8));
    };
    t = window.setTimeout(next, 250);
    return () => clearTimeout(t);
  }, [on, every, range]);
  useEffect(() => {
    if (!on || !blinkEvery) return;
    let t = 0, u = 0;
    const next = () => {
      setBlink(true); u = window.setTimeout(() => setBlink(false), 130);
      t = window.setTimeout(next, blinkEvery * 1000 * (0.7 + Math.random() * 0.6));
    };
    t = window.setTimeout(next, blinkEvery * 500);
    return () => { clearTimeout(t); clearTimeout(u); setBlink(false); };
  }, [on, blinkEvery]);
  return { look, blink };
}

/** Bare mascots from Jacob's Pen mockup: red blob, white square, blue droplet, violet triangle, two dark dot eyes. */
export function AgentAvatar({ agent, size = 34, alive = false }: { agent: Agent; size?: number; alive?: boolean }) {
  const w = useAnim().working;
  const shadowId = `bot-shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const u = 32 / size;
  const { look, blink } = useGaze(alive, w.lookEvery, w.lookRange, w.blinkEvery);
  const eye = agent.eye ?? "#17171c";
  const art = {
    blob: [<path d="M5.2 17.6c-.9-4.6 2.6-8.6 8.6-9.4 6.4-.9 12.5 1 13.1 5.6.6 4.6-3.3 8.7-9.9 9.6-6.2.8-11-1.5-11.8-5.8z" />, <><ellipse cx="11" cy="15.6" rx="2.1" ry="1.6" /><ellipse cx="16.6" cy="15.9" rx="1.6" ry="1.3" /></>],
    square: [<rect x="5.5" y="5.5" width="21" height="21" rx="3.5" />, <><rect x="12.6" y="14" width="2" height="4.6" rx="1" /><rect x="17.4" y="14" width="2" height="4.6" rx="1" /></>],
    drop: [<path d="M21.5 4.5c2.6 3.4 5.3 7.6 5.3 12.3 0 6-4.6 10.7-10.6 10.7S5.6 23.2 5.6 17.6C5.6 10.4 12.6 6 21.5 4.5z" />, <><ellipse cx="17.4" cy="13.6" rx="1.2" ry="1.7" /><ellipse cx="21.4" cy="13.4" rx="1.1" ry="1.6" /></>],
    tri: [<path d="M13.5 6.6c1.2-1.9 3.8-1.9 5 0l9 14.6c1.2 2-.2 4.5-2.5 4.5H7c-2.3 0-3.7-2.5-2.5-4.5z" />, <><rect x="12.9" y="16" width="2" height="4.4" rx="1" /><rect x="17.1" y="16" width="2" height="4.4" rx="1" /></>],
  };
  const [body, eyes] = art[agent.shape];
  return (
    <svg data-shape={agent.shape} className="overflow-visible" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <filter id={shadowId} data-figma-shadow filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
          x={-64 * u} y={-64 * u} width={32 + 128 * u} height={32 + 128 * u} colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius={2 * u} result="aSpread" />
          <feGaussianBlur in="aSpread" stdDeviation={8 * u} result="aBlur" />
          <feOffset in="aBlur" dx="0" dy={8 * u} result="aOffset" />
          <feFlood floodColor="#000000" floodOpacity="0.24" result="aColor" />
          <feComposite in="aColor" in2="aOffset" operator="in" result="shadowA" />
          <feMorphology in="SourceAlpha" operator="erode" radius={u} result="bSpread" />
          <feGaussianBlur in="bSpread" stdDeviation={4 * u} result="bBlur" />
          <feOffset in="bBlur" dx="0" dy={4 * u} result="bOffset" />
          <feFlood floodColor="#000000" floodOpacity="0.20" result="bColor" />
          <feComposite in="bColor" in2="bOffset" operator="in" result="shadowB" />
          <feMerge><feMergeNode in="shadowA" /><feMergeNode in="shadowB" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g data-bot-body fill={agent.hue} filter={`url(#${shadowId})`}>{body}</g>
      <motion.g animate={{ x: look.x, y: look.y }} transition={{ type: "spring", stiffness: 320, damping: 24 }}>
        <motion.g fill={eye} animate={{ scaleY: blink ? 0.1 : 1 }} transition={{ duration: 0.07 }}>{eyes}</motion.g>
      </motion.g>
    </svg>
  );
}

function Badge({ status }: { status: AgentStatus }) {
  const reduce = useReduce();
  const anim = useAnim();
  if (status === "idle") return null;
  // the moving eyes carry "working"; keep the badge only when that motion is unavailable
  if (status === "working" && anim.working.enabled && !reduce) return null;
  // 16px badge (even) + marks drawn in a 16×16 viewBox around (8,8), so nothing lands on a half pixel
  const ink = badgeInk[status], stroke = { fill: "none", stroke: ink, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const mark = {
    needs: <><rect x="7" y="3.25" width="2" height="5.5" rx="1" fill={ink} /><circle cx="8" cy="11.5" r="1.15" fill={ink} /></>,
    done: <path d="M4.75 8 7 10.25 11.25 5.75" {...stroke} />,
    error: <path d="M5.5 5.5l5 5m0-5l-5 5" {...stroke} />,
    working: <motion.path d="M8 4a4 4 0 1 1-4 4" {...stroke} style={{ originX: "8px", originY: "8px" }} animate={reduce ? {} : { rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />,
  }[status];
  return (
    <motion.span key={status} aria-hidden="true" data-badge={status}
      initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}
      className="absolute -right-1.5 -bottom-1.5 block size-4 rounded-full">
      <svg viewBox="0 0 16 16" width="16" height="16" className="block overflow-visible">
        <circle data-badge-body cx="8" cy="8" r="8" fill={tone[status]} stroke={ink}
          strokeWidth={2 * BADGE_OUTER_PX} strokeLinejoin="round" paintOrder="stroke fill" />
        {mark}
      </svg>
    </motion.span>
  );
}

function Confetti({ seed }: { seed: number }) {
  const { pieces, spread, duration } = useAnim().done;
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => {
    const ang = (i / pieces) * Math.PI * 2 + (seed % 7) * 0.3, d = spread + ((i * 37 + seed) % 14);
    return { x: Math.cos(ang) * d, y: Math.sin(ang) * d - 6, r: (i * 53) % 360, c: ["#f2333f", "#22c55e", "#fbbf24", "#60a5fa", "#ffffff"][i % 4], round: i % 3 === 0 };
  }), [seed, pieces, spread]);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {bits.map((b, i) => (
        <motion.span key={i} className={clsx("absolute h-1.5 w-1", b.round && "size-1.5 rounded-full")} style={{ background: b.c }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 10], opacity: [1, 1, 0], scale: 1, rotate: b.r }}
          transition={{ duration, ease: [0.2, 0.7, 0.3, 1], times: [0, 0.6, 1] }} />
      ))}
    </span>
  );
}

function BotButton({ agent, actions }: { agent: Agent; actions: BotActions }) {
  const reduce = useReduce();
  const s = agent.status;
  // portal into <main> so floating content stays inside a landmark
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.querySelector("main")), []);
  const activity = s === "idle" ? (agent.last ? `Last: ${agent.last.verb}, ${agent.last.target}` : "Idle, waiting for work") : `${agent.activity.verb}, ${agent.activity.target}`;
  const label = `${agent.name}, ${statusLabel[s]}. ${activity}`;
  const { working: w, needs: n, error: e, done: d } = useAnim();
  const working = s === "working" && w.enabled && !reduce;
  const pulse = { duration: n.ringDuration, repeat: Infinity, repeatDelay: Math.max(0, n.every - n.ringDuration) };
  const body = (
    <motion.span className="relative inline-flex size-9 items-center justify-center"
      animate={reduce ? {} : working ? { y: [0, -w.bob, 0], rotate: [0, w.tilt, 0, -w.tilt, 0] }
        : s === "error" && e.enabled ? { x: [0, -e.distance, e.distance, -e.distance * 0.6, 0] }
        : s === "needs" && n.enabled ? { y: [0, -n.hop, 0, 0] } : { x: 0, y: 0, rotate: 0 }}
      transition={working ? { y: { duration: w.period, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: w.period * 2, repeat: Infinity, ease: "easeInOut" } }
        : s === "needs" && n.enabled ? { ...pulse, ease: "easeInOut", times: [0, 0.2, 0.45, 1] }
        : s === "error" ? { duration: e.duration } : { duration: 0.4 }}>
      <AgentAvatar agent={agent} alive={working} />
      <Badge status={s} />
    </motion.span>
  );
  return (
    <Popover.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Popover.Trigger aria-label={label} data-agent={agent.id} data-status={s}
            className="group relative flex items-center justify-center rounded-xl outline-offset-2 transition-colors hover:bg-white/[0.07] data-[state=open]:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/70"
            style={{ width: SLOT, height: SLOT, padding: 4, cursor: "inherit" }}>
            {/* status ring: breathing halo for working (only when the eyes can't carry it), soft ping for needs-you */}
            {s === "working" && !working && <motion.span aria-hidden="true" className="absolute inset-0.5 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${tone.working}, 0 0 14px ${tone.working}55` }}
              animate={reduce ? { opacity: 0.6 } : { opacity: [0.15, 0.6, 0.15], scale: [0.92, 1.04, 0.92] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />}
            {s === "needs" && n.enabled && <motion.span aria-hidden="true" className="absolute inset-1 rounded-full" style={{ boxShadow: `0 0 0 2px ${tone.needs}` }}
              animate={reduce ? { opacity: 0.9 } : { opacity: [0.9, 0], scale: [0.95, n.ringScale] }} transition={{ ...pulse, ease: "easeOut" }} />}
            {s === "done" && !reduce && d.enabled && <Confetti key={agent.since} seed={Math.round(agent.since)} />}
            {/* 36px visual sits in a reserved 44px button; lift/scale never changes layout. */}
            <span data-bot-hover className="relative flex size-9 shrink-0 items-center justify-center transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.04] group-focus-visible:-translate-y-0.5 motion-reduce:transform-none">{body}</span>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal container={host}>
          <Tooltip.Content side="bottom" sideOffset={8} className="z-50 max-w-60 rounded-lg border border-white/10 bg-[#1b1b20] px-2.5 py-1.5 text-xs text-white shadow-lg">
            <span className="font-semibold">{agent.name}</span> <span className="text-[var(--color-gray-300)]">· {statusLabel[s]}</span>
            <div className="text-[var(--color-gray-200)]">{activity}</div>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Popover.Portal container={host}>
        <Popover.Content side="bottom" align="center" sideOffset={10} collisionPadding={12} aria-label={`${agent.name} details`}
          className="z-40 w-80 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <AgentAvatar agent={agent} size={28} />
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-fg">{agent.name}</div><div className="text-xs text-fg-2">{agent.role}</div></div>
            <StatusPill status={s} />
          </div>
          {s === "idle" && !agent.last ? <p className="text-xs text-fg-2">No recent activity.</p> : (() => {
            const a = s === "idle" ? agent.last! : agent.activity;
            return <ToolCallCard key={`${agent.id}-${agent.since}`} verb={a.verb} target={a.target} status={toolStatus(agent)} input={a.input} output={a.output} error={a.error} defaultOpen={s === "needs" || s === "error"} />;
          })()}
          {s === "needs" && <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-fg-2 hover:bg-surface-2" onClick={() => actions.decline(agent)}>Decline</button>
            <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90" onClick={() => actions.approve(agent)}>Approve</button>
          </div>}
          {s === "error" && <div className="mt-3 flex justify-end"><button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-fg-2 hover:bg-surface-2" onClick={() => actions.retry(agent)}>Retry</button></div>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function StatusPill({ status }: { status: AgentStatus }) {
  const cls = { idle: "bg-surface-2 text-fg-2", working: "bg-brand-soft text-[var(--color-brand-700)]", needs: "bg-warn-soft text-warn", done: "bg-ok-soft text-ok", error: "bg-err-soft text-err" }[status];
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{statusLabel[status]}</span>;
}

function Bubble({ m, agents, onDone }: { m: Message; agents: Agent[]; onDone: () => void }) {
  const reduce = useReduce();
  const { duration } = useAnim().handoff;
  const fi = agents.findIndex(a => a.id === m.from), ti = agents.findIndex(a => a.id === m.to);
  const x0 = cx(fi), x1 = cx(ti), lift = 46 + Math.abs(ti - fi) * 10;
  const from = agents[fi], to = agents[ti];
  if (reduce) return (
    <motion.div aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 3, times: [0, 0.05, 0.9, 1] }} onAnimationComplete={onDone}
      className="absolute right-0 bottom-full mb-2 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg-2 shadow-sm">
      <Mail className="size-3.5" /> <b className="text-fg">{from.name}</b> → <b className="text-fg">{to.name}</b>: {m.text}
    </motion.div>
  );
  return (
    <motion.div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-10" style={{ marginLeft: -12, marginTop: 4 }}
      initial={{ x: x0, y: 0, scale: 0.3, opacity: 0 }}
      animate={{ x: [x0, x0, (x0 + x1) / 2, x1, x1], y: [0, -18, -lift, -14, 0], scale: [0.3, 1, 1, 1, 0.4], opacity: [0, 1, 1, 1, 0] }}
      transition={{ duration, times: [0, 0.14, 0.5, 0.88, 1], ease: "easeInOut" }} onAnimationComplete={onDone}>
      <span className="flex h-5 w-6 items-center justify-center rounded-md rounded-bl-sm bg-[#24242b] shadow-md ring-1 ring-white/15">
        <span className="flex gap-0.5">{[0, 1, 2].map(i => <span key={i} className="size-1 rounded-full" style={{ background: from.id === "juniper" ? "#e5e5ea" : from.hue }} />)}</span>
      </span>
    </motion.div>
  );
}

export interface BotActions { approve: (a: Agent) => void; decline: (a: Agent) => void; retry: (a: Agent) => void }

/** The near-invisible presence strip: avatars only, motion carries state. */
export function PresenceWidget({ agents, messages, onMsgDone, actions }: { agents: Agent[]; messages: Message[]; onMsgDone: (id: number) => void; actions: BotActions }) {
  const handoff = useAnim().handoff.enabled;
  useEffect(() => { if (!handoff) messages.forEach(m => onMsgDone(m.id)); }, [handoff, messages, onMsgDone]);
  return (
    <Tooltip.Provider delayDuration={250}>
      <div role="group" aria-label="Agents" className="relative flex items-center" style={{ padding: PAD, gap: GAP }}>
        {agents.map(a => <BotButton key={a.id} agent={a} actions={actions} />)}
        <AnimatePresence>{handoff && messages.map(m => <Bubble key={m.id} m={m} agents={agents} onDone={() => onMsgDone(m.id)} />)}</AnimatePresence>
      </div>
    </Tooltip.Provider>
  );
}
