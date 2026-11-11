"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { Pause, Play, ArrowRightLeft, CheckCircle2, XCircle, BellRing, Accessibility, LocateFixed, Bot, ChevronRight } from "lucide-react";
import { PresenceWidget, ReduceCtx, AgentAvatar } from "@/components/presence/presence";
import { FloatingOverlay, resetOverlayPosition, useIsMobile } from "@/components/presence/overlay";
import { AnimationControls } from "@/components/presence/animation-controls";
import { glassFor, IridescentShimmer } from "@/components/lab/glass";
import { initialAgents, useSimulation, SCRIPT_LEN, type Agent, type SimState } from "@/lib/engine";
import { AnimCtx, useAnimSettings } from "@/lib/anim-config";
import { defaults, type StyleId } from "@/lib/lab-config";
import { drawBackdrop } from "@/lib/backdrops";
import preset from "@/presets/jacob-2026-11-03.json";

const scenes: Record<string, Partial<SimState>> = {
  states: { playing: false, agents: [
    { ...initialAgents[0], status: "working", activity: { verb: "Writing", target: "release-notes.md", input: "sections: Added, Fixed" } },
    { ...initialAgents[1], status: "done", since: 1, activity: { verb: "Searched", target: "merged pull requests", output: "12 results" } },
    { ...initialAgents[2], status: "needs", activity: { verb: "Deploy", target: "v2.4 to staging", input: "needs your approval" } },
    { ...initialAgents[3], status: "error", activity: { verb: "Running", target: "test suite", error: "2 tests failed" } },
  ] },
  idle: { playing: false },
};

type DemoBg = "abstract" | "busy" | "campfire";
const BACKGROUNDS: { id: DemoBg; label: string }[] = [
  { id: "abstract", label: "Abstract" },
  { id: "busy", label: "Busy screens" },
  { id: "campfire", label: "Campfire" },
];

type BotStyleId = "default" | "frosted" | "dark" | "iridescent" | "aurora";
const BOT_STYLES: { id: BotStyleId; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "frosted", label: "Frosted grain" },
  { id: "dark", label: "Dark glass" },
  { id: "iridescent", label: "Iridescent" },
  { id: "aurora", label: "Aurora glow" },
];
const DEMO_GLASS: Partial<Record<BotStyleId, typeof glassFor.frosted>> = {
  frosted: glassFor.frosted,
  dark: glassFor.dark,
  iridescent: IridescentShimmer,
  aurora: glassFor.aurora,
};

type WidgetSizeId = "s" | "m" | "l";
const WIDGET_SIZES: { id: WidgetSizeId; label: string; scale: number }[] = [
  { id: "s", label: "Small", scale: 1 },
  { id: "m", label: "Medium", scale: 1.2 },
  { id: "l", label: "Large", scale: 1.4 },
];

const actionMeta = {
  working: { label: "Working", Icon: Bot, ring: "#8fb4ff", fill: "rgba(143,180,255,0.22)", phrase: "is working", status: "working" },
  complete: { label: "Complete", Icon: CheckCircle2, ring: "#22c55e", fill: "rgba(34,197,94,0.22)", phrase: "completed", status: "done" },
  error: { label: "Error", Icon: XCircle, ring: "#f97066", fill: "rgba(249,112,102,0.22)", phrase: "hit an error", status: "error" },
  needs: { label: "Needs you", Icon: BellRing, ring: "#fbbf24", fill: "rgba(251,191,36,0.22)", phrase: "needs you", status: "needs" },
} as const;
type ActionKind = keyof typeof actionMeta;
const PLAY_RING = "#4ade80";
const PLAY_FILL = "rgba(74, 222, 128, 0.22)";

function BusyBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
      const src = drawBackdrop("busy", w, h, dpr);
      canvas.width = src.width;
      canvas.height = src.height;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.getContext("2d")!.drawImage(src, 0, 0);
    };
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function StatusButton({ kind, active, flashed, reduce, onClick }: { kind: ActionKind; active: boolean; flashed: boolean; reduce: boolean; onClick: () => void }) {
  const { label, Icon, ring, fill } = actionMeta[kind];
  const lit = active || flashed;
  return (
    <motion.button
      type="button"
      data-status-action={kind}
      aria-pressed={active}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      animate={reduce ? { scale: 1 } : flashed ? { scale: [1, 0.96, 1] } : { scale: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold max-md:min-h-11",
        lit ? "border-transparent text-white" : "border-white/15 text-white/80 hover:bg-white/10",
      )}
      style={lit ? { background: fill, boxShadow: `inset 0 0 0 1px ${ring}, 0 0 0 1px ${ring}66` } : undefined}
    >
      <Icon className="size-3.5" aria-hidden />{label}
    </motion.button>
  );
}

function CompactToolbar({ stuck, reduce, playing, onPlay, onAction, focusKind, flash, slot, visible }: {
  stuck: boolean;
  reduce: boolean;
  playing: boolean;
  onPlay: () => void;
  onAction: (kind: ActionKind) => void;
  focusKind: ActionKind | null;
  flash: ActionKind | null;
  slot: { mode: "action"; agent: { hue: string }; key: number } | { mode: "playing"; loop: number; progress: number } | null;
  visible: boolean;
}) {
  return (
    <div
      data-compact-bar
      data-compact-stuck={stuck ? "true" : "false"}
      aria-hidden={!stuck}
      inert={!stuck}
      className="fixed inset-x-0 z-[15] hidden max-md:block"
      style={{
        top: "var(--demo-stage-h)",
        opacity: stuck ? 1 : 0,
        transform: stuck ? "translateY(0)" : "translateY(-8px)",
        pointerEvents: stuck ? "auto" : "none",
        transition: reduce ? "none" : "opacity 200ms ease, transform 200ms ease",
      }}
    >
      <div
        className="flex items-center gap-2 py-1"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          background: "rgba(20, 20, 24, 0.96)",
          backdropFilter: "blur(12px)",
        }}
      >
        <motion.button
          type="button"
          data-compact-play
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          onClick={onPlay}
          whileTap={reduce ? undefined : { scale: 0.96 }}
          className={clsx(
            "inline-flex min-h-11 min-w-[4.5rem] flex-[1.75] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold",
            playing ? "border-transparent text-white" : "border-white/15 text-white hover:bg-white/10",
          )}
          style={playing ? { background: PLAY_FILL, boxShadow: `inset 0 0 0 1px ${PLAY_RING}, 0 0 0 1px ${PLAY_RING}66` } : undefined}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {playing ? "Pause" : "Play"}
        </motion.button>
        {(["working", "complete", "error", "needs"] as const).map(k => {
          const { label, Icon, ring, fill } = actionMeta[k];
          const lit = focusKind === k || flash === k;
          return (
            <motion.button
              key={k}
              type="button"
              data-compact-action={k}
              aria-label={label}
              aria-pressed={focusKind === k}
              onClick={() => onAction(k)}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              animate={reduce ? { scale: 1 } : flash === k ? { scale: [1, 0.96, 1] } : { scale: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
              className={clsx(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border",
                lit ? "border-transparent text-white" : "border-white/15 text-white/80 hover:bg-white/10",
              )}
              style={lit ? { background: fill, boxShadow: `inset 0 0 0 1px ${ring}, 0 0 0 1px ${ring}66` } : undefined}
            >
              <Icon className="size-4" aria-hidden />
            </motion.button>
          );
        })}
      </div>
      <div className="h-[2px] overflow-hidden" aria-hidden="true" data-compact-progress style={{ backgroundColor: "rgba(20, 20, 24, 0.96)" }}>
        <div className="h-full" style={{ opacity: visible ? 1 : 0, transition: reduce ? "none" : "opacity 200ms ease" }}>
          {slot?.mode === "action" && (
            <motion.div
              key={slot.key}
              className="h-full origin-left rounded-full"
              style={{ background: slot.agent.hue }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: reduce ? 0 : 1 }}
              transition={reduce ? { duration: 0 } : { duration: 5, ease: "linear" }}
            />
          )}
          {slot?.mode === "playing" && (
            <motion.div
              key={slot.loop}
              className="h-full origin-left rounded-full"
              style={{ background: PLAY_RING }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: reduce ? 0 : slot.progress }}
              transition={reduce ? { duration: 0 } : { duration: 0.1, ease: "linear" }}
            />
          )}
        </div>
      </div>
      <div
        data-compact-fade
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-full h-5"
        style={{ background: "linear-gradient(to bottom, rgba(20, 20, 24, 0.96), rgba(20, 20, 24, 0))" }}
      />
    </div>
  );
}

function Demo() {
  const q = useSearchParams();
  const system = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  const [forced, setForced] = useState(q.get("rm") === "1");
  const reduce = forced || system;
  const sim = useSimulation({ playing: false, ...(scenes[q.get("scene") ?? ""] ?? {}) });
  const anim = useAnimSettings();
  const [bg, setBg] = useState<DemoBg>("abstract");
  const [botStyle, setBotStyle] = useState<BotStyleId>("default");
  const [widgetSize, setWidgetSize] = useState<WidgetSizeId>("s");
  const [otherOpen, setOtherOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const compactSentinel = useRef<HTMLDivElement>(null);
  const [flare, setFlare] = useState(false);
  const [focus, setFocus] = useState<{ kind: ActionKind; agentId: string } | null>(null);
  const [flash, setFlash] = useState<ActionKind | null>(null);
  const [lineKey, setLineKey] = useState(0);
  const flashTimer = useRef<number | null>(null);
  const lineTimer = useRef<number | null>(null);
  const lineGen = useRef(0);
  const lastStatusSlot = useRef<
    | { mode: "action"; agent: Agent; kind: ActionKind; key: number }
    | { mode: "playing"; loop: number; progress: number }
    | null
  >(null);
  const interrupted = useRef(false);
  const { s } = sim;
  const agentsRef = useRef(s.agents);
  agentsRef.current = s.agents;
  const simRef = useRef(sim);
  simRef.current = sim;
  const pauseIfPlaying = () => {
    if (simRef.current.s.playing) {
      interrupted.current = true;
      simRef.current.play(false);
    }
  };
useEffect(() => {
    const savedBg = localStorage.getItem("agent-presence.bg");
    if (savedBg === "abstract" || savedBg === "busy" || savedBg === "campfire") setBg(savedBg);
    const savedStyle = localStorage.getItem("agent-presence.botStyle");
    const styleId = savedStyle === "iridescent-shimmer" ? "iridescent" : savedStyle;
    if (styleId && BOT_STYLES.some(s => s.id === styleId)) setBotStyle(styleId as BotStyleId);
    const savedSize = localStorage.getItem("agent-presence.widgetSize");
    if (savedSize === "s" || savedSize === "m" || savedSize === "l") setWidgetSize(savedSize);
  }, []);
  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    if (lineTimer.current) window.clearTimeout(lineTimer.current);
  }, []);
  useEffect(() => {
    if (!isMobile) { setCompact(false); return; }
    const el = compactSentinel.current;
    if (!el) return;
    let obs: IntersectionObserver | null = null;
    const start = () => {
      obs?.disconnect();
      const stage = document.querySelector<HTMLElement>("[data-demo-stage]");
      const top = stage?.getBoundingClientRect().height ?? 0;
      obs = new IntersectionObserver(([entry]) => {
        const rootTop = entry.rootBounds?.top ?? top;
        setCompact(!entry.isIntersecting && entry.boundingClientRect.top < rootTop + 1);
      }, { root: null, rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 });
      obs.observe(el);
    };
    start();
    window.addEventListener("resize", start);
    return () => { obs?.disconnect(); window.removeEventListener("resize", start); };
  }, [isMobile]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey || e.metaKey || e.repeat) return;
      const map: Record<string, BotStyleId> = { "1": "frosted", "2": "dark", "3": "iridescent", "4": "aurora" };
      const id = map[e.key];
      if (!id) return;
      e.preventDefault();
      if (simRef.current.s.playing) {
        interrupted.current = true;
        simRef.current.play(false);
      }
      setBotStyle(id);
      localStorage.setItem("agent-presence.botStyle", id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const chooseBg = (id: DemoBg) => {
    pauseIfPlaying();
    if (isMobile && id === "busy") return;
    setBg(id);
    localStorage.setItem("agent-presence.bg", id);
  };
  const chooseStyle = (id: BotStyleId) => { pauseIfPlaying(); setBotStyle(id); localStorage.setItem("agent-presence.botStyle", id); };
  const chooseSize = (id: WidgetSizeId) => { pauseIfPlaying(); setWidgetSize(id); localStorage.setItem("agent-presence.widgetSize", id); };
  const actions = {
    approve: (a: Agent) => sim.setStatus(a.id, "working", { verb: a.activity.verb.replace(/^Deploy$/, "Deploying").replace(/^Send$/, "Sending"), target: a.activity.target }, `Approved. ${a.name} is continuing`),
    decline: (a: Agent) => sim.setStatus(a.id, "idle", undefined, `Declined. ${a.name} stopped: ${a.activity.target}`),
    retry: (a: Agent) => sim.setStatus(a.id, "working", { verb: "Retrying", target: a.activity.target }),
  };
  const [note, setNote] = useState("");
  const focusedAgent = focus ? s.agents.find(a => a.id === focus.agentId) : undefined;
  const actionSlot = focusedAgent && focus ? { mode: "action" as const, agent: focusedAgent, kind: focus.kind, key: lineKey } : null;
  const loopProgress = Math.min(1, Math.max(0, (s.t - s.loop * SCRIPT_LEN) / SCRIPT_LEN));
  const playingSlot = s.playing ? { mode: "playing" as const, loop: s.loop, progress: loopProgress } : null;
  const visibleSlot = actionSlot ?? playingSlot;
  if (visibleSlot) lastStatusSlot.current = visibleSlot;
  const slot = visibleSlot ?? lastStatusSlot.current;
  const doneCount = s.agents.filter(a => a.status === "done").length;
  useEffect(() => { if (!doneCount) return; setFlare(true); const t = window.setTimeout(() => setFlare(false), 1400); return () => window.clearTimeout(t); }, [doneCount]);
  const idleAll = () => { for (const a of agentsRef.current) if (a.status !== "idle") sim.setStatus(a.id, "idle"); };
  const idleOthers = (keepId: string) => {
    for (const a of agentsRef.current) if (a.id !== keepId && a.status !== "idle") sim.setStatus(a.id, "idle");
  };
  const stopLineTimer = () => {
    if (lineTimer.current) { window.clearTimeout(lineTimer.current); lineTimer.current = null; }
  };
  const startLineTimer = () => {
    stopLineTimer();
    const gen = ++lineGen.current;
    setLineKey(k => k + 1);
    lineTimer.current = window.setTimeout(() => {
      if (lineGen.current !== gen) return;
      setFocus(null);
      setFlash(null);
      lineTimer.current = null;
      idleAll();
    }, 5000);
  };
  const onAction = (kind: ActionKind) => {
    pauseIfPlaying();
    const agent = sim.trigger(kind);
    if (!agent) return;
    // Replace any previous status: idle the other bots, then startLineTimer
    // cancels the old timeout and issues a new generation token so it cannot
    // clear this one.
    idleOthers(agent.id);
    setFocus({ kind, agentId: agent.id });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash(kind);
    flashTimer.current = window.setTimeout(() => setFlash(null), reduce ? 0 : 280);
    startLineTimer();
  };
  const clearStatuses = () => {
    pauseIfPlaying();
    lineGen.current += 1;
    stopLineTimer();
    setFocus(null);
    setFlash(null);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    idleAll();
  };
  const onHandoff = () => {
    pauseIfPlaying();
    sim.trigger("handoff");
  };
  const onPlayClick = () => {
    if (s.playing) {
      interrupted.current = false;
      sim.play(false);
      return;
    }
    stopLineTimer();
    lineGen.current += 1;
    setFocus(null);
    setFlash(null);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    if (interrupted.current) {
      interrupted.current = false;
      idleAll();
      sim.restart();
    } else {
      sim.play(true);
    }
  };
  const widgetScale = WIDGET_SIZES.find(sz => sz.id === widgetSize)!.scale;
  const styleCfg = botStyle === "default" ? null
    : botStyle === "iridescent" ? {}
    : { ...defaults[botStyle], ...(preset.styles as Record<StyleId, object>)[botStyle] };
  const Glass = botStyle === "default" ? null : DEMO_GLASS[botStyle];
  // On a phone, Busy screens has nothing to show, so fall back visually to
  // Abstract without overwriting the saved desktop preference.
  const displayBg: DemoBg = isMobile && bg === "busy" ? "abstract" : bg;

  return (
    <ReduceCtx.Provider value={reduce}>
      <AnimCtx.Provider value={anim.cfg}>
      <MotionConfig reducedMotion={reduce ? "always" : "never"}>
        <main
          data-demo
          className="relative h-screen min-h-[560px] overflow-hidden text-white max-md:h-auto max-md:min-h-dvh max-md:overflow-visible"
          data-demo-bg={displayBg}
          data-bot-style={botStyle}
          data-widget-size={widgetSize}
        >
          {displayBg === "busy" && <BusyBackdrop />}

          <div
            data-demo-stage
            data-demo-bg={displayBg}
            className="md:contents max-md:flex max-md:flex-col max-md:overflow-hidden max-md:pt-[env(safe-area-inset-top,0px)] max-md:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          >
            {(displayBg === "campfire" || displayBg === "abstract") && (
              <picture className="pointer-events-none absolute inset-0 md:hidden" aria-hidden="true">
                <source
                  media="(max-width: 767px)"
                  srcSet={`/backgrounds/${displayBg}-828.webp 828w, /backgrounds/${displayBg}-1080.webp 1080w`}
                  sizes="100vw"
                />
                <img alt="" className="h-full w-full object-cover object-center" />
              </picture>
            )}

            <div className="md:contents max-md:relative max-md:z-10 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:items-center max-md:justify-center">
              <FloatingOverlay agents={s.agents} onAnnounce={setNote} scale={widgetScale}
                glass={Glass && styleCfg ? (open) => <Glass cfg={styleCfg} open={open} reduce={reduce} agents={s.agents} flare={flare} src={null} /> : undefined}>
                <PresenceWidget agents={s.agents} messages={s.messages} onMsgDone={sim.msgDone} actions={actions} />
              </FloatingOverlay>
            </div>
          </div>
          <div data-demo-stage-spacer className="md:hidden" aria-hidden="true" />

            <nav aria-label="Desktop Backgrounds" data-bg-nav className="absolute top-6 left-1/2 z-10 -translate-x-1/2 max-md:hidden">
              <div role="radiogroup" aria-label="Desktop Backgrounds" className="flex rounded-xl border border-white/10 bg-[#141418]/85 p-1 shadow-lg backdrop-blur">
                {BACKGROUNDS.map(({ id, label }) => (
                  <button key={id} type="button" role="radio" aria-checked={displayBg === id} data-bg-option={id} onClick={() => chooseBg(id)}
                    className={clsx("rounded-lg px-3 py-1.5 text-xs font-semibold", displayBg === id ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
                    {label}
                  </button>
                ))}
              </div>
            </nav>

          <header className="absolute bottom-6 left-6 z-10 max-w-sm max-md:hidden">
            <h1 className="text-lg font-semibold text-white">Agent Presence · overlay</h1>
            <p className="mt-1 text-sm text-white/75">A floating, near-invisible overlay for your agents. Drag it anywhere, hover for controls, hide it when you want a clean desktop. Hover or Tab to a bot for its activity; click for details.</p>
            <p className="mt-2 text-xs text-white/55"><a href="/lab/" className="underline underline-offset-2 hover:text-white">Style Lab</a><span aria-hidden="true"> · </span><a href="/desktop/" className="underline underline-offset-2 hover:text-white">Desktop shell</a></p>
          </header>

          {/* Director controls — demo only, not part of the widget */}
          <section aria-label="Demo controls" className="absolute top-6 right-6 z-10 max-h-[calc(100vh-3rem)] w-72 overflow-y-auto rounded-xl border border-white/10 bg-[#141418]/85 p-4 shadow-lg backdrop-blur max-md:static max-md:z-10 max-md:mt-0 max-md:max-h-none max-md:w-full max-md:overflow-visible max-md:rounded-none max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0 max-md:bg-[#141418] max-md:px-4 max-md:pt-5 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-md:shadow-none max-md:backdrop-blur-none">
            <div className="mb-6 md:hidden" data-mobile-about>
              <h1 className="m-0 p-0 text-xs font-semibold">
                <button type="button" aria-expanded={aboutOpen} aria-controls="demo-about-body" data-about-toggle
                  onClick={() => setAboutOpen(o => !o)}
                  className="flex w-full min-h-11 items-center gap-2 text-xs font-semibold text-white/70 hover:text-white">
                  <span className="flex-1 text-left">Agent Presence · overlay</span>
                  <ChevronRight className={clsx("size-3.5 shrink-0 transition-transform", aboutOpen && "rotate-90")} aria-hidden />
                </button>
              </h1>
              {aboutOpen && (
                <div id="demo-about-body" className="mt-3 space-y-2">
                  <p className="text-sm text-white/75">A floating, near-invisible overlay for your agents. Hover or tap a bot for its activity; tap for details.</p>
                  <p className="text-xs text-white/55"><a href="/lab/" className="underline underline-offset-2 hover:text-white">Style Lab</a><span aria-hidden="true"> · </span><a href="/desktop/" className="underline underline-offset-2 hover:text-white">Desktop shell</a></p>
                </div>
              )}
            </div>
            <h2 className="text-xs font-semibold tracking-wide text-white/65 uppercase">Demo controls</h2>
            {isMobile && <div ref={compactSentinel} data-compact-sentinel aria-hidden="true" className="pointer-events-none h-px -mb-px" />}
            <div data-demo-actions aria-hidden={compact || undefined} inert={compact || undefined} className={compact ? "pointer-events-none" : undefined}>
            <button
              type="button"
              data-play-button
              aria-pressed={s.playing}
              onClick={onPlayClick}
              tabIndex={compact ? -1 : undefined}
              className={clsx(
                "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold max-md:min-h-11",
                s.playing ? "border-transparent text-white" : "border-white/15 text-white hover:bg-white/10",
              )}
              style={s.playing ? { background: PLAY_FILL, boxShadow: `inset 0 0 0 1px ${PLAY_RING}, 0 0 0 1px ${PLAY_RING}66` } : undefined}
            >
              {s.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}{s.playing ? "Pause" : "Play"}
            </button>
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-2">
                {anim.cfg.handoff.enabled && (
                  <button onClick={onHandoff} tabIndex={compact ? -1 : undefined} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 max-md:min-h-11">
                    <ArrowRightLeft className="size-3.5" aria-hidden />Handoff
                  </button>
                )}
                {(["working", "complete", "error", "needs"] as const).map(k => (
                  <StatusButton key={k} kind={k} active={focus?.kind === k} flashed={flash === k} reduce={reduce} onClick={() => onAction(k)} />
                ))}
              </div>
            </div>
            </div>
            {isMobile && (
              <CompactToolbar
                stuck={compact}
                reduce={reduce}
                playing={s.playing}
                onPlay={onPlayClick}
                onAction={onAction}
                focusKind={focus?.kind ?? null}
                flash={flash}
                slot={slot}
                visible={!!visibleSlot}
              />
            )}
            <div className="mt-3 h-[28px] overflow-hidden" data-status-slot>
                <div
                  data-action-target={actionSlot ? `${actionSlot.agent.id}:${actionSlot.kind}` : undefined}
                  data-status-slot-mode={visibleSlot?.mode}
                  className="h-full"
                  style={{ opacity: visibleSlot ? 1 : 0, transition: reduce ? "none" : "opacity 200ms ease" }}
                  aria-hidden={!visibleSlot}
                >
                  {slot?.mode === "action" && (
                    <>
                      <p className="flex items-center gap-1.5 text-xs text-white/80">
                        <AgentAvatar agent={slot.agent} size={16} />
                        <span><span className="font-semibold text-white">{slot.agent.name}</span> {actionMeta[slot.kind].phrase}</span>
                      </p>
                      <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-white/10" aria-hidden="true" data-status-progress>
                        <motion.div
                          key={slot.key}
                          className="h-full origin-left rounded-full"
                          style={{ background: slot.agent.hue }}
                          initial={reduce ? false : { scaleX: 0 }}
                          animate={{ scaleX: reduce ? 0 : 1 }}
                          transition={reduce ? { duration: 0 } : { duration: 5, ease: "linear" }}
                        />
                      </div>
                    </>
                  )}
                  {slot?.mode === "playing" && (
                    <>
                      <p className="flex items-center gap-1.5 text-xs text-white/80">
                        <span className="font-semibold text-white">Playing demo</span>
                      </p>
                      <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-white/10" aria-hidden="true" data-status-progress data-loop-progress={slot.progress.toFixed(4)}>
                        <motion.div
                          key={slot.loop}
                          className="h-full origin-left rounded-full"
                          style={{ background: PLAY_RING }}
                          initial={reduce ? false : { scaleX: 0 }}
                          animate={{ scaleX: reduce ? 0 : slot.progress }}
                          transition={reduce ? { duration: 0 } : { duration: 0.1, ease: "linear" }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
              <button type="button" data-clear-statuses onClick={clearStatuses} className="mt-3 inline-flex min-h-0 items-center text-xs text-white/55 hover:text-white max-md:min-h-11">
                Clear statuses
              </button>
            <div className="mt-6 border-t border-white/10 pt-6 md:hidden" data-bg-panel>
              <h3 className="text-xs font-semibold tracking-wide text-white/65 uppercase" id="bg-label">Background</h3>
              <div role="radiogroup" aria-labelledby="bg-label" className="mt-2 flex rounded-lg border border-white/15 p-0.5">
                {BACKGROUNDS.filter(b => b.id !== "busy").map(({ id, label }) => (
                  <button key={id} type="button" role="radio" aria-checked={displayBg === id} data-bg-option={id} onClick={() => chooseBg(id)}
                    className={clsx("flex-1 rounded-md px-2 py-1.5 text-xs font-semibold min-h-11", displayBg === id ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 border-t border-white/10 pt-6">
              <h3 className="text-xs font-semibold tracking-wide text-white/65 uppercase">Appearance</h3>
              <h4 className="mt-3 text-[10px] font-semibold tracking-wide text-white/65 uppercase" id="bot-style-label">Bot style</h4>
              <div role="radiogroup" aria-labelledby="bot-style-label" className="mt-2 grid grid-cols-2 gap-2">
                {BOT_STYLES.map(({ id, label }) => (
                  <button key={id} type="button" role="radio" aria-checked={botStyle === id} data-style-option={id} onClick={() => chooseStyle(id)}
                    className={clsx("rounded-lg border px-2 py-1.5 text-xs font-semibold max-md:min-h-11", botStyle === id ? "border-transparent bg-white/15 text-white" : "border-white/15 text-white/80 hover:bg-white/10")}>
                    {label}
                  </button>
                ))}
              </div>
              <h4 className="mt-3 text-[10px] font-semibold tracking-wide text-white/65 uppercase" id="widget-size-label">Widget size</h4>
              <div role="radiogroup" aria-labelledby="widget-size-label" className="mt-2 flex rounded-lg border border-white/15 p-0.5">
                {WIDGET_SIZES.map(({ id, label }) => (
                  <button key={id} type="button" role="radio" aria-checked={widgetSize === id} data-size-option={id} onClick={() => chooseSize(id)}
                    className={clsx("flex-1 rounded-md px-2 py-1.5 text-xs font-semibold max-md:min-h-11", widgetSize === id ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <AnimationControls {...anim} />
            <div className="mt-6 border-t border-white/10 pt-6">
              <button type="button" aria-expanded={otherOpen} aria-controls="demo-other-options" data-other-toggle
                onClick={() => setOtherOpen(o => !o)}
                className="flex w-full items-center gap-2 text-xs font-semibold text-white/70 hover:text-white max-md:min-h-11">
                <ChevronRight className={clsx("size-3.5 shrink-0 transition-transform", otherOpen && "rotate-90")} aria-hidden />
                Other
              </button>
              {otherOpen && (
                <div id="demo-other-options" className="mt-3 space-y-3">
                  <button onClick={resetOverlayPosition} data-reset-position className="inline-flex items-center gap-2 text-xs text-white/70 hover:text-white max-md:hidden"><LocateFixed className="size-3.5" aria-hidden /> Reset overlay position</button>
                  <label className="flex items-center gap-2 text-xs text-white/75 max-md:min-h-11">
                    <input type="checkbox" checked={reduce} disabled={system} onChange={e => setForced(e.target.checked)} />
                    <Accessibility className="size-3.5" aria-hidden /> Reduced motion{system ? " (system)" : ""}
                  </label>
                </div>
              )}
            </div>
          </section>

          <p role="status" aria-live="polite" className="sr-only">{s.announce}</p>
          <p role="status" aria-live="polite" data-overlay-status className="sr-only">{note}</p>
        </main>
      </MotionConfig>
      </AnimCtx.Provider>
    </ReduceCtx.Provider>
  );
}
export default function Page() { return <Suspense><Demo /></Suspense>; }
