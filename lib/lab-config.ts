// Style Lab: one config block per glass style + the control definitions that render its panel.
export type StyleId = "frosted" | "dark" | "iridescent" | "aurora" | "pixel" | "refraction";
export type Val = number | string | boolean;
export type StyleCfg = Record<string, Val>;
export type LabCfg = Record<StyleId, StyleCfg>;

export type Field =
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; type: "color" }
  | { key: string; label: string; type: "toggle"; hint?: string }
  | { key: string; label: string; type: "select"; options: [string, string][] };

export const styles: { id: StyleId; name: string; blurb: string; fields: Field[] }[] = [
  { id: "frosted", name: "Frosted grain", blurb: "Soft blur with fine film grain on top.", fields: [
    { key: "blur", label: "Blur", type: "range", min: 0, max: 40, step: 1, unit: "px" },
    { key: "tint", label: "Tint color", type: "color" },
    { key: "tintOpacity", label: "Tint opacity", type: "range", min: 0, max: 0.8, step: 0.01 },
    { key: "noise", label: "Noise amount", type: "range", min: 0, max: 0.6, step: 0.01 },
    { key: "noiseSize", label: "Noise size", type: "range", min: 40, max: 320, step: 10, unit: "px" },
    { key: "saturation", label: "Saturation", type: "range", min: 0.5, max: 2.5, step: 0.05, unit: "×" },
  ] },
  { id: "dark", name: "Dark glass + rim", blurb: "Near-black tint, a light-catching rim, a soft inner glow.", fields: [
    { key: "darkness", label: "Tint darkness", type: "range", min: 0, max: 0.95, step: 0.01 },
    { key: "rimAngle", label: "Rim gradient angle", type: "range", min: 0, max: 360, step: 5, unit: "°" },
    { key: "rimWidth", label: "Rim width", type: "range", min: 0.5, max: 4, step: 0.25, unit: "px" },
    { key: "rimBrightness", label: "Rim brightness", type: "range", min: 0, max: 1, step: 0.01 },
    { key: "innerGlow", label: "Inner glow", type: "range", min: 0, max: 1, step: 0.01 },
    { key: "shadow", label: "Shadow", type: "range", min: 0, max: 1, step: 0.01 },
  ] },
  { id: "iridescent", name: "Iridescent edge", blurb: "A slow rainbow sheen that lives on the border only.", fields: [
    { key: "speed", label: "Hue speed", type: "range", min: 0, max: 1.5, step: 0.05, unit: " rev/s" },
    { key: "edge", label: "Edge width", type: "range", min: 0.5, max: 5, step: 0.25, unit: "px" },
    { key: "intensity", label: "Intensity", type: "range", min: 0, max: 1, step: 0.01 },
    { key: "saturation", label: "Saturation", type: "range", min: 0, max: 2.5, step: 0.05, unit: "×" },
    { key: "onlyComplete", label: "Only on task complete", type: "toggle", hint: "Edge stays dark and flares when confetti fires." },
  ] },
  { id: "aurora", name: "Aurora glow", blurb: "Blurred color blobs behind the pill, tinted by bot states.", fields: [
    { key: "blobs", label: "Blob count", type: "range", min: 1, max: 6, step: 1 },
    { key: "blur", label: "Blur", type: "range", min: 4, max: 48, step: 1, unit: "px" },
    { key: "speed", label: "Speed", type: "range", min: 0, max: 2, step: 0.05, unit: "×" },
    { key: "intensity", label: "Intensity", type: "range", min: 0, max: 1, step: 0.01 },
    { key: "tintByActive", label: "Tint by active bot", type: "toggle", hint: "Off: each blob takes one bot's state color." },
  ] },
  { id: "pixel", name: "Pixel / dither", blurb: "The backdrop shows through as chunky pixels (WebGL).", fields: [
    { key: "pixelSize", label: "Pixel size", type: "range", min: 2, max: 16, step: 1, unit: "px" },
    { key: "pattern", label: "Dither pattern", type: "select", options: [["bayer", "Bayer 4×4"], ["halftone", "Halftone"], ["none", "None"]] },
    { key: "levels", label: "Color levels", type: "range", min: 2, max: 8, step: 1 },
    { key: "contrast", label: "Contrast", type: "range", min: 0.5, max: 2, step: 0.05, unit: "×" },
    { key: "tint", label: "Palette tint", type: "color" },
    { key: "tintAmount", label: "Tint amount", type: "range", min: 0, max: 1, step: 0.01 },
  ] },
  { id: "refraction", name: "Refraction lens", blurb: "A WebGL lens that bends the backdrop at the pill's edge.", fields: [
    { key: "strength", label: "Strength", type: "range", min: 0, max: 1.5, step: 0.01 },
    { key: "chroma", label: "Chromatic aberration", type: "range", min: 0, max: 1, step: 0.01 },
    { key: "edge", label: "Edge thickness", type: "range", min: 4, max: 30, step: 1, unit: "px" },
    { key: "dim", label: "Dim", type: "range", min: 0, max: 0.8, step: 0.01 },
  ] },
];

export const defaults: LabCfg = {
  frosted: { blur: 18, tint: "#ffffff", tintOpacity: 0.12, noise: 0.22, noiseSize: 140, saturation: 1.6 },
  dark: { darkness: 0.72, rimAngle: 135, rimWidth: 1.25, rimBrightness: 0.6, innerGlow: 0.3, shadow: 0.5 },
  iridescent: { speed: 0.2, edge: 1.5, intensity: 0.85, saturation: 1.3, onlyComplete: false },
  aurora: { blobs: 4, blur: 32, speed: 0.6, intensity: 0.75, tintByActive: false },
  pixel: { pixelSize: 6, pattern: "bayer", levels: 4, contrast: 1.15, tint: "#7f56d9", tintAmount: 0.3 },
  refraction: { strength: 0.7, chroma: 0.4, edge: 14, dim: 0.3 },
};

/** Looks that can work in a real transparent desktop window (no backdrop image needed). */
export const desktopSafe: StyleId[] = ["frosted", "dark", "iridescent", "aurora"];
export const SAFE_KEY = "agent-presence.lab.desktopSafe";
export const LAB_KEY = "agent-presence.lab";
/** Demo / recording scale for the whole overlay (pill, bots, badges, bubble, confetti). */
export const DEMO_SCALES = [1, 1.25, 1.5, 2] as const;
export type DemoScale = (typeof DEMO_SCALES)[number];
export const SCALE_KEY = "agent-presence.lab.demoScale";
export const hex3 = (h: string): [number, number, number] => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
