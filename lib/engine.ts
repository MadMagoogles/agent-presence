"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ToolStatus } from "@/components/agent/tool-call-card";

export type AgentStatus = "idle" | "working" | "needs" | "done" | "error";
export interface Activity { verb: string; target: string; input?: string; output?: string; error?: string }
export interface Agent { id: string; name: string; role: string; shape: "blob" | "square" | "drop" | "tri"; hue: string; eye?: string; status: AgentStatus; activity: Activity; since: number; last?: Activity }
export interface Message { id: number; from: string; to: string; text: string }
export interface SimState { t: number; playing: boolean; speed: number; agents: Agent[]; messages: Message[]; announce: string; cursor: number; loop: number }

const idleAct: Activity = { verb: "Idle", target: "waiting for work" };
export const initialAgents: Agent[] = [
  { id: "atlas", name: "Atlas", role: "Writer", shape: "blob", hue: "#f2333f", status: "idle", activity: idleAct, since: 0 },
  { id: "juniper", name: "Juniper", role: "Researcher", shape: "square", hue: "#ffffff", status: "idle", activity: idleAct, since: 0 },
  { id: "moss", name: "Moss", role: "Release manager", shape: "drop", hue: "#1f7cf2", status: "idle", activity: idleAct, since: 0 },
  { id: "wren", name: "Wren", role: "Tester", shape: "tri", hue: "#9e77ed", status: "idle", activity: idleAct, since: 0 },
];

type Action =
  | { type: "tick"; dt: number } | { type: "play"; on: boolean } | { type: "speed"; v: number }
  | { type: "set"; id: string; status: AgentStatus; activity?: Activity; say?: string }
  | { type: "msg"; from: string; to: string; text: string } | { type: "msgDone"; id: number }
  | { type: "load"; state: Partial<SimState> };

/** Scripted day in the life: times in sim-ms. Loops. */
type Step = { at: number; run: (s: SimState) => Action[] };
const set = (id: string, status: AgentStatus, activity?: Activity, say?: string): Action => ({ type: "set", id, status, activity, say });
export const SCRIPT: Step[] = [
  { at: 400, run: () => [set("juniper", "working", { verb: "Searching", target: "merged pull requests", input: "repo:acme/web merged:>v2.3" })] },
  { at: 1400, run: () => [set("atlas", "working", { verb: "Outlining", target: "release notes v2.4", input: "template: release-notes.md" })] },
  { at: 4200, run: () => [{ type: "msg", from: "juniper", to: "atlas", text: "12 PRs merged since v2.3" }] },
  { at: 5600, run: () => [set("juniper", "done", { verb: "Searched", target: "merged pull requests", output: "12 results, 3 user-facing" })] },
  { at: 6400, run: () => [set("atlas", "working", { verb: "Writing", target: "release-notes.md", input: "sections: Added, Fixed, Changed" })] },
  { at: 7400, run: () => [set("wren", "working", { verb: "Running", target: "test suite", input: "pnpm test --filter web" })] },
  { at: 10400, run: () => [set("wren", "error", { verb: "Running", target: "test suite", error: "2 tests failed: date-picker.spec.ts" })] },
  { at: 12200, run: () => [set("wren", "working", { verb: "Retrying", target: "flaky date-picker tests", input: "--retries=2" })] },
  { at: 14600, run: () => [set("wren", "done", { verb: "Ran", target: "test suite", output: "184 passed, 0 failed" })] },
  { at: 15400, run: () => [{ type: "msg", from: "wren", to: "moss", text: "Tests green on main" }] },
  { at: 16600, run: () => [{ type: "msg", from: "atlas", to: "moss", text: "Release notes ready" }, set("atlas", "done", { verb: "Wrote", target: "release-notes.md", output: "312 words, 3 sections" })] },
  { at: 18200, run: () => [set("moss", "needs", { verb: "Deploy", target: "v2.4 to staging", input: "needs your approval" })] },
  { at: 24000, run: (s) => s.agents.find(a => a.id === "moss")?.status === "needs" ? [set("moss", "working", { verb: "Deploying", target: "v2.4 to staging" }, "Moss auto-approved for the demo loop")] : [] },
  { at: 27000, run: (s) => s.agents.find(a => a.id === "moss")?.status === "working" ? [set("moss", "done", { verb: "Deployed", target: "v2.4 to staging", output: "staging.acme.dev · healthy" })] : [] },
];
const SCRIPT_LEN = 31000;
const DONE_HOLD = 2600; // done → settles back to idle

const statusWord: Record<AgentStatus, string> = { idle: "is idle", working: "started", needs: "needs you", done: "finished", error: "hit an error" };
let msgId = 1;

function reducer(s: SimState, a: Action): SimState {
  switch (a.type) {
    case "play": return { ...s, playing: a.on, announce: a.on ? "Simulation playing" : "Simulation paused" };
    case "speed": return { ...s, speed: a.v };
    case "load": return { ...s, ...a.state };
    case "msgDone": return { ...s, messages: s.messages.filter(m => m.id !== a.id) };
    case "msg": {
      const f = s.agents.find(x => x.id === a.from)!, to = s.agents.find(x => x.id === a.to)!;
      return { ...s, messages: [...s.messages, { id: msgId++, from: a.from, to: a.to, text: a.text }], announce: `${f.name} to ${to.name}: ${a.text}` };
    }
    case "set": {
      const agents = s.agents.map(x => x.id !== a.id ? x : {
        ...x, status: a.status, since: s.t, activity: a.activity ?? (a.status === "idle" ? idleAct : x.activity),
        last: a.status === "idle" && x.status !== "idle" ? x.activity : x.last,
      });
      const ag = agents.find(x => x.id === a.id)!;
      const announce = a.say ?? (a.status === "idle" ? s.announce : `${ag.name} ${statusWord[a.status]}: ${ag.activity.verb} ${ag.activity.target}`);
      return { ...s, agents, announce };
    }
    case "tick": {
      if (!s.playing) return s;
      let n: SimState = { ...s, t: s.t + a.dt * s.speed };
      // settle "done" agents back to motionless idle
      for (const ag of n.agents) if (ag.status === "done" && n.t - ag.since > DONE_HOLD) n = reducer(n, set(ag.id, "idle"));
      const local = n.t - n.loop * SCRIPT_LEN;
      while (n.cursor < SCRIPT.length && SCRIPT[n.cursor].at <= local) {
        for (const act of SCRIPT[n.cursor].run(n)) n = reducer(n, act);
        n = { ...n, cursor: n.cursor + 1 };
      }
      if (local >= SCRIPT_LEN) n = { ...n, cursor: 0, loop: n.loop + 1 };
      return n;
    }
  }
}

export function useSimulation(init?: Partial<SimState>) {
  const [s, dispatch] = useReducer(reducer, { t: 0, playing: true, speed: 1, agents: initialAgents, messages: [], announce: "", cursor: 0, loop: 0, ...init });
  const last = useRef<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => { const now = performance.now(); const dt = last.current ? now - last.current : 100; last.current = now; dispatch({ type: "tick", dt }); }, 100);
    return () => clearInterval(id);
  }, []);
  const ref = useRef(s); ref.current = s;
  const lastStatusId = useRef<string | null>(null);
  const pick = (pref: AgentStatus[], not?: string) => { const ags = ref.current.agents.filter(x => x.id !== not); for (const p of pref) { const f = ags.find(x => x.status === p); if (f) return f; } return ags[Math.floor(Math.random() * ags.length)]; };
  /** Random bot among preferred statuses; never the same bot twice in a row when another is available. */
  const pickStatus = (pref: AgentStatus[], not?: string) => {
    const ags = ref.current.agents.filter(x => x.id !== not);
    const seen = new Set<string>();
    const matching: Agent[] = [];
    for (const p of pref) for (const a of ags) if (a.status === p && !seen.has(a.id)) { seen.add(a.id); matching.push(a); }
    const avoidRepeat = (pool: Agent[]) => {
      if (lastStatusId.current && pool.length > 1) {
        const others = pool.filter(a => a.id !== lastStatusId.current);
        if (others.length) return others;
      }
      return pool;
    };
    let pool = avoidRepeat(matching);
    if (!pool.length) pool = avoidRepeat(ags);
    if (!pool.length) pool = ags;
    const a = pool[Math.floor(Math.random() * pool.length)];
    if (a) lastStatusId.current = a.id;
    return a;
  };
  const trigger = useCallback((kind: "handoff" | "working" | "complete" | "error" | "needs"): Agent | undefined => {
    if (kind === "working") { const a = pickStatus(["idle", "done", "error"]); dispatch(set(a.id, "working", { verb: "Drafting", target: "weekly status update", input: "sources: standup notes, merged PRs" })); return a; }
    if (kind === "handoff") { const from = pick(["working", "done", "idle"]); const to = pick(["idle", "working"], from.id); dispatch({ type: "msg", from: from.id, to: to.id, text: `Handing off: ${from.activity.target}` }); dispatch(set(to.id, "working", { verb: "Picking up", target: from.activity.target === "waiting for work" ? "shared task" : from.activity.target }, `${from.name} to ${to.name}: Handing off ${from.activity.target}`)); return to; }
    if (kind === "complete") { const a = pickStatus(["working", "needs", "error", "idle"]); dispatch(set(a.id, "done", { ...a.activity, verb: a.activity.verb === "Idle" ? "Finished" : a.activity.verb, target: a.activity.target === "waiting for work" ? "quick task" : a.activity.target, output: "Completed successfully" })); return a; }
    if (kind === "error") { const a = pickStatus(["working", "idle"]); dispatch(set(a.id, "error", { verb: a.status === "working" ? a.activity.verb : "Fetching", target: a.status === "working" ? a.activity.target : "design tokens", error: "Request timed out after 30s" })); return a; }
    if (kind === "needs") { const a = pickStatus(["working", "idle"]); dispatch(set(a.id, "needs", { verb: "Send", target: "email to 3 reviewers", input: "needs your approval" })); return a; }
  }, []);
  return {
    s, trigger,
    play: (on: boolean) => dispatch({ type: "play", on }), speed: (v: number) => dispatch({ type: "speed", v }),
    setStatus: (id: string, status: AgentStatus, activity?: Activity, say?: string) => dispatch(set(id, status, activity, say)),
    msgDone: (id: number) => dispatch({ type: "msgDone", id }),
    sendMsg: (from: string, to: string, text: string) => dispatch({ type: "msg", from, to, text }),
  };
}

export const toolStatus = (a: Agent): ToolStatus => ({ idle: "success", working: "running", needs: "awaiting", done: "success", error: "error" } as const)[a.status];
export const statusLabel: Record<AgentStatus, string> = { idle: "Idle", working: "Working", needs: "Needs you", done: "Done", error: "Error" };
