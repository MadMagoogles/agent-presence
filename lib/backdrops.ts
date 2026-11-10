// Procedural desktop backdrops, drawn once into a canvas. The same canvas is the page background
// and the WebGL texture the shader glass samples, so pixel/refraction "see" exactly what's behind them.
export type BackdropId = "gradient" | "busy" | "light";
export const backdrops: [BackdropId, string][] = [["gradient", "Gradient"], ["busy", "Busy UI"], ["light", "Light"]];

const blob = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => {
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, c.replace(/[\d.]+\)$/, "0)"));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
};
const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };

export function drawBackdrop(id: BackdropId, w: number, h: number, dpr = 1): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext("2d")!; g.scale(dpr, dpr);
  if (id === "light") {
    const lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, "#f4f1ff"); lg.addColorStop(0.5, "#eef6ff"); lg.addColorStop(1, "#fff3ea"); g.fillStyle = lg; g.fillRect(0, 0, w, h);
    blob(g, w * 0.3, h * 0.25, w * 0.35, "rgba(158,119,237,0.45)"); blob(g, w * 0.7, h * 0.3, w * 0.3, "rgba(56,189,248,0.4)");
    blob(g, w * 0.5, h * 0.85, w * 0.4, "rgba(251,146,60,0.35)");
    for (let i = 0; i < 9; i++) rr(g, w * 0.08 + i * w * 0.075, h * 0.12, w * 0.05, w * 0.05, 12, `hsla(${i * 40},80%,70%,0.55)`);
    return c;
  }
  // vivid mesh wallpaper (base for gradient + busy)
  const lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, "#1b0b3a"); lg.addColorStop(0.5, "#0b2a4a"); lg.addColorStop(1, "#3a0b2a"); g.fillStyle = lg; g.fillRect(0, 0, w, h);
  blob(g, w * 0.2, h * 0.2, w * 0.45, "rgba(236,72,153,0.85)"); blob(g, w * 0.75, h * 0.15, w * 0.4, "rgba(59,130,246,0.85)");
  blob(g, w * 0.55, h * 0.7, w * 0.45, "rgba(250,204,21,0.6)"); blob(g, w * 0.1, h * 0.9, w * 0.35, "rgba(16,185,129,0.75)");
  blob(g, w * 0.9, h * 0.8, w * 0.35, "rgba(168,85,247,0.8)");
  if (id === "gradient") {
    g.globalAlpha = 0.12; g.strokeStyle = "#fff"; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) { g.beginPath(); for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.2 + i * 22 + Math.sin(x / 140 + i * 0.4) * 40); g.stroke(); }
    g.globalAlpha = 1; return c;
  }
  // busy: app windows with sidebars, text bars, a chart and cards
  const win = (x: number, y: number, ww: number, wh: number, accent: string, dark: boolean) => {
    g.save(); g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 30; g.shadowOffsetY = 12;
    rr(g, x, y, ww, wh, 12, dark ? "#17161f" : "#fbfbfd"); g.restore();
    rr(g, x, y, ww, 30, 12, dark ? "#24222e" : "#ececf2"); g.fillStyle = dark ? "#24222e" : "#ececf2"; g.fillRect(x, y + 18, ww, 12);
    ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => { g.beginPath(); g.arc(x + 16 + i * 18, y + 15, 5, 0, 7); g.fillStyle = col; g.fill(); });
    g.fillStyle = dark ? "#1e1c28" : "#f2f1f7"; g.fillRect(x, y + 30, ww * 0.24, wh - 30);
    for (let i = 0; i < 8; i++) rr(g, x + 12, y + 46 + i * 24, ww * 0.24 - 24 - (i % 3) * 14, 9, 4, i === 1 ? accent : dark ? "#3a3747" : "#d9d7e3");
    const cx = x + ww * 0.24 + 18, cw = ww * 0.76 - 36;
    rr(g, cx, y + 46, cw * 0.5, 14, 5, dark ? "#e9e7f2" : "#1f1d2b");
    for (let i = 0; i < 3; i++) rr(g, cx + i * (cw / 3), y + 74, cw / 3 - 10, 56, 8, `hsla(${(i * 70 + (dark ? 200 : 300)) % 360},75%,${dark ? 45 : 60}%,0.9)`);
    for (let i = 0; i < 12; i++) { const bh = 20 + ((i * 37) % 60); rr(g, cx + i * (cw / 12), y + 210 - bh, cw / 12 - 6, bh, 3, accent); }
    for (let i = 0; i < 6; i++) rr(g, cx, y + 226 + i * 18, cw * (0.5 + ((i * 29) % 40) / 100), 8, 4, dark ? "#3a3747" : "#d9d7e3");
  };
  win(w * 0.04, h * 0.08, w * 0.46, h * 0.62, "#a78bfa", true);
  win(w * 0.36, h * 0.3, w * 0.42, h * 0.6, "#f472b6", false);
  win(w * 0.66, h * 0.05, w * 0.3, h * 0.44, "#34d399", true);
  rr(g, w * 0.3, h - 52, w * 0.4, 44, 14, "rgba(255,255,255,0.18)");
  for (let i = 0; i < 9; i++) rr(g, w * 0.3 + 12 + i * (w * 0.4 - 24) / 9, h - 46, 32, 32, 9, `hsl(${i * 40},80%,60%)`);
  return c;
}
