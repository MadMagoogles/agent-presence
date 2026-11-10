"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface AnimConfig {
  working: { enabled: boolean; lookEvery: number; lookRange: number; blinkEvery: number; bob: number; tilt: number; period: number };
  needs: { enabled: boolean; every: number; ringDuration: number; ringScale: number; hop: number };
  error: { enabled: boolean; distance: number; duration: number };
  done: { enabled: boolean; pieces: number; spread: number; duration: number };
  handoff: { enabled: boolean; duration: number };
}
export type AnimKey = keyof AnimConfig;

export const defaultAnim: AnimConfig = {
  working: { enabled: true, lookEvery: 1.4, lookRange: 1.8, blinkEvery: 3.5, bob: 1.5, tilt: 3, period: 2.8 },
  needs: { enabled: true, every: 4, ringDuration: 1.4, ringScale: 1.35, hop: 3 },
  error: { enabled: true, distance: 2.5, duration: 0.4 },
  done: { enabled: true, pieces: 14, spread: 22, duration: 0.9 },
  handoff: { enabled: false, duration: 1.5 },
};

export interface AnimField { key: string; label: string; min: number; max: number; step: number; unit: string; zero?: string }
export const animFields: { id: AnimKey; title: string; fields: AnimField[] }[] = [
  { id: "working", title: "Working", fields: [
    { key: "lookEvery", label: "Look around every", min: 0.4, max: 4, step: 0.1, unit: "s" },
    { key: "lookRange", label: "Eye travel", min: 0.5, max: 3, step: 0.1, unit: "px" },
    { key: "blinkEvery", label: "Blink every", min: 0, max: 8, step: 0.5, unit: "s", zero: "Never" },
    { key: "bob", label: "Float height", min: 0, max: 4, step: 0.25, unit: "px" },
    { key: "tilt", label: "Sway", min: 0, max: 8, step: 0.5, unit: "°" },
    { key: "period", label: "Float cycle", min: 1, max: 6, step: 0.2, unit: "s" },
  ] },
  { id: "needs", title: "Needs you", fields: [
    { key: "every", label: "Pulse every", min: 1.5, max: 10, step: 0.5, unit: "s" },
    { key: "ringDuration", label: "Ring duration", min: 0.4, max: 3, step: 0.1, unit: "s" },
    { key: "ringScale", label: "Ring size", min: 1, max: 1.8, step: 0.05, unit: "×" },
    { key: "hop", label: "Hop height", min: 0, max: 6, step: 0.5, unit: "px" },
  ] },
  { id: "error", title: "Error", fields: [
    { key: "distance", label: "Shake distance", min: 0, max: 6, step: 0.5, unit: "px" },
    { key: "duration", label: "Shake duration", min: 0.2, max: 1.2, step: 0.05, unit: "s" },
  ] },
  { id: "done", title: "Complete", fields: [
    { key: "pieces", label: "Confetti pieces", min: 4, max: 30, step: 1, unit: "" },
    { key: "spread", label: "Spread", min: 10, max: 40, step: 1, unit: "px" },
    { key: "duration", label: "Duration", min: 0.4, max: 2, step: 0.1, unit: "s" },
  ] },
  { id: "handoff", title: "Handoff", fields: [
    { key: "duration", label: "Flight duration", min: 0.6, max: 3, step: 0.1, unit: "s" },
  ] },
];

export const AnimCtx = createContext<AnimConfig>(defaultAnim);
export const useAnim = () => useContext(AnimCtx);

const STORE = "agent-presence.anim";

/** Tuning state, persisted locally so tweaks survive reloads. */
export function useAnimSettings() {
  const [cfg, setCfg] = useState<AnimConfig>(defaultAnim);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<AnimConfig> | null;
      if (saved) setCfg(Object.fromEntries((Object.keys(defaultAnim) as AnimKey[]).map(k => [k, { ...defaultAnim[k], ...saved[k] }])) as unknown as AnimConfig);
    } catch {}
  }, []);
  const update = useCallback((id: AnimKey, patch: Record<string, number | boolean>) => setCfg(c => {
    const next = { ...c, [id]: { ...c[id], ...patch } };
    localStorage.setItem(STORE, JSON.stringify(next));
    return next;
  }), []);
  const reset = useCallback(() => { localStorage.removeItem(STORE); setCfg(defaultAnim); }, []);
  return { cfg, update, reset };
}
