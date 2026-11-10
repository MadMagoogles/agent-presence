"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MotionConfig, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { Pause, Play, ArrowRightLeft, CheckCircle2, XCircle, BellRing, Accessibility, LocateFixed, Bot, Text } from "lucide-react";
import { PresenceWidget, ReduceCtx } from "@/components/presence/presence";
import { FloatingOverlay, resetOverlayPosition } from "@/components/presence/overlay";
import { AnimationControls } from "@/components/presence/animation-controls";
import { initialAgents, useSimulation, type Agent, type SimState } from "@/lib/engine";
import { AnimCtx, useAnimSettings } from "@/lib/anim-config";

const scenes: Record<string, Partial<SimState>> = {
  states: { playing: false, agents: [
    { ...initialAgents[0], status: "working", activity: { verb: "Writing", target: "release-notes.md", input: "sections: Added, Fixed" } },
    { ...initialAgents[1], status: "done", since: 1, activity: { verb: "Searched", target: "merged pull requests", output: "12 results" } },
    { ...initialAgents[2], status: "needs", activity: { verb: "Deploy", target: "v2.4 to staging", input: "needs your approval" } },
    { ...initialAgents[3], status: "error", activity: { verb: "Running", target: "test suite", error: "2 tests failed" } },
  ] },
  idle: { playing: false },
};

// Dark, moody abstract wallpaper — pure CSS gradients, no artwork.
const WALLPAPER = [
  "radial-gradient(900px 520px at 72% 62%, rgba(78,104,92,0.55), transparent 62%)",
  "radial-gradient(700px 460px at 18% 28%, rgba(84,22,34,0.55), transparent 60%)",
  "radial-gradient(620px 420px at 48% 8%, rgba(46,60,72,0.6), transparent 65%)",
  "conic-gradient(from 210deg at 62% 48%, rgba(20,34,30,0.9), rgba(12,12,18,0.9), rgba(34,22,30,0.9), rgba(20,34,30,0.9))",
  "linear-gradient(160deg, #0c0d11, #121418 50%, #0a0b0e)",
].join(", ");

function Demo() {
  const q = useSearchParams();
  const system = useReducedMotion() ?? false;
  const [forced, setForced] = useState(q.get("rm") === "1");
  const reduce = forced || system;
  const sim = useSimulation(scenes[q.get("scene") ?? ""]);
  const anim = useAnimSettings();
  const [showSummary, setShowSummary] = useState(true);
  useEffect(() => { if (localStorage.getItem("agent-presence.summary") === "0") setShowSummary(false); }, []);
  const toggleSummary = (on: boolean) => { setShowSummary(on); localStorage.setItem("agent-presence.summary", on ? "1" : "0"); };
  const { s } = sim;
  const counts = s.agents.reduce((m, a) => (m[a.status]++, m), { idle: 0, working: 0, needs: 0, done: 0, error: 0 } as Record<string, number>);
  const summary = [counts.working && `${counts.working} working`, counts.needs && `${counts.needs} needs you`, counts.error && `${counts.error} error`].filter(Boolean).join(" · ") || "All quiet";
  const actions = {
    approve: (a: Agent) => sim.setStatus(a.id, "working", { verb: a.activity.verb.replace(/^Deploy$/, "Deploying").replace(/^Send$/, "Sending"), target: a.activity.target }, `Approved. ${a.name} is continuing`),
    decline: (a: Agent) => sim.setStatus(a.id, "idle", undefined, `Declined. ${a.name} stopped: ${a.activity.target}`),
    retry: (a: Agent) => sim.setStatus(a.id, "working", { verb: "Retrying", target: a.activity.target }),
  };
  const [note, setNote] = useState("");

  return (
    <ReduceCtx.Provider value={reduce}>
      <AnimCtx.Provider value={anim.cfg}>
      <MotionConfig reducedMotion={reduce ? "always" : "never"}>
        <main className="relative h-screen min-h-[560px] overflow-hidden text-white" style={{ background: WALLPAPER }}>
          <header className="absolute bottom-6 left-6 max-w-sm">
            <h1 className="text-lg font-semibold text-white">Agent Presence · overlay</h1>
            <p className="mt-1 text-sm text-white/75">A floating, near-invisible overlay for your agents. Drag it anywhere, hover for controls, hide it when you want a clean desktop. Hover or Tab to a bot for its activity; click for details.</p>
            <p className="mt-2 text-xs text-white/55"><a href="/lab/" className="underline underline-offset-2 hover:text-white">Style Lab</a><span aria-hidden="true"> · </span><a href="/desktop/" className="underline underline-offset-2 hover:text-white">Desktop shell</a></p>
            {showSummary && <p className="mt-1 text-xs text-white/60" aria-hidden="true">{summary}</p>}
          </header>

          {/* Director controls — demo only, not part of the widget */}
          <section aria-label="Demo controls" className="absolute top-6 right-6 max-h-[calc(100vh-3rem)] w-64 overflow-y-auto rounded-xl border border-white/10 bg-[#141418]/85 p-3 shadow-lg backdrop-blur">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-white/65 uppercase">Demo controls</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => sim.play(!s.playing)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/10">
                {s.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}{s.playing ? "Pause" : "Play"}
              </button>
              <div role="radiogroup" aria-label="Speed" className="flex rounded-lg border border-white/15 p-0.5">
                {[0.5, 1, 2].map(v => <button key={v} role="radio" aria-checked={s.speed === v} onClick={() => sim.speed(v)}
                  className={clsx("rounded-md px-2 py-1 text-xs font-semibold", s.speed === v ? "bg-white/15 text-white" : "text-white/70")}>{v}×</button>)}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {([["handoff", "Handoff", ArrowRightLeft], ["working", "Working", Bot], ["complete", "Complete", CheckCircle2], ["error", "Error", XCircle], ["needs", "Needs you", BellRing]] as const).filter(([k]) => k !== "handoff" || anim.cfg.handoff.enabled).map(([k, l, I]) =>
                <button key={k} onClick={() => sim.trigger(k)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"><I className="size-3.5" aria-hidden />{l}</button>)}
            </div>
            <button onClick={resetOverlayPosition} className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white"><LocateFixed className="size-3.5" aria-hidden /> Reset overlay position</button>
            <label className="mt-2 flex items-center gap-2 text-xs text-white/75">
              <input type="checkbox" checked={reduce} disabled={system} onChange={e => setForced(e.target.checked)} />
              <Accessibility className="size-3.5" aria-hidden /> Reduced motion{system ? " (system)" : ""}
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-xs text-white/75">
              <input type="checkbox" checked={showSummary} onChange={e => toggleSummary(e.target.checked)} />
              <Text className="size-3.5" aria-hidden /> Status summary text
            </label>
            <AnimationControls {...anim} />
          </section>

          <p role="status" aria-live="polite" className="sr-only">{s.announce}</p>
          <p role="status" aria-live="polite" data-overlay-status className="sr-only">{note}</p>

          <FloatingOverlay agents={s.agents} onAnnounce={setNote}>
            <PresenceWidget agents={s.agents} messages={s.messages} onMsgDone={sim.msgDone} actions={actions} />
          </FloatingOverlay>
        </main>
      </MotionConfig>
      </AnimCtx.Provider>
    </ReduceCtx.Provider>
  );
}
export default function Page() { return <Suspense><Demo /></Suspense>; }
