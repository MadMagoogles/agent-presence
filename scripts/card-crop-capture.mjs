/** Portfolio card crops: tight 1200×675 still + seamless 4–6s loop of Dark-style avatar cluster. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PORT = 3147;
const OUT = "/workspace/empire/agent-presence/screens";
const RAW = "/tmp/ap-card-raw";
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });
for (const f of readdirSync(RAW)) unlinkSync(join(RAW, f));

const srv = spawn(process.execPath, ["scripts/serve-static.mjs"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
const killSrv = () => { try { process.kill(srv.pid); } catch {} };
process.on("exit", killSrv);
for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/desktop/`); break; }
  catch { await new Promise(r => setTimeout(r, 250)); }
  if (i === 59) throw new Error("static server failed");
}

const W = 1280, H = 720; // CSS viewport; dpr 2 → 2560×1440 buffer
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  recordVideo: { dir: RAW, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/desktop/`, { waitUntil: "networkidle" });

// Clean subtle dark backdrop + center/enlarge widget so cluster fills ~65% of a 16:9 card.
await page.addStyleTag({ content: `
  html, body, .desktop-stage {
    background: radial-gradient(ellipse 90% 70% at 50% 42%, #1c1830 0%, #12101c 48%, #0a090f 100%) !important;
  }
  .desktop-anchor {
    left: 50% !important;
    top: 50% !important;
    margin: 0 !important;
    transform: translate(-50%, -50%) scale(2.35) !important;
    transform-origin: center center !important;
  }
  .desktop-restore { display: none !important; }
` });

await page.waitForSelector("[data-desktop-pill]", { state: "visible" });
await page.locator("[data-desktop-pill]").focus();
await page.keyboard.press("2"); // Dark style
await page.waitForTimeout(500);
await page.keyboard.press("i"); // idle all
await page.waitForTimeout(400);

// Measure widget fill of viewport
const fill = await page.locator("[data-desktop-pill]").evaluate(el => {
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height, left: r.left, top: r.top, vw: innerWidth, vh: innerHeight, pct: r.width / innerWidth };
});
console.log("widget fill", fill);
if (fill.pct < 0.55 || fill.pct > 0.78) {
  // nudge scale toward ~0.65
  const target = 0.65;
  const newScale = 2.35 * (target / fill.pct);
  await page.addStyleTag({ content: `.desktop-anchor { transform: translate(-50%, -50%) scale(${newScale.toFixed(3)}) !important; }` });
  await page.waitForTimeout(300);
  const fill2 = await page.locator("[data-desktop-pill]").evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: r.width, pct: r.width / innerWidth };
  });
  console.log("widget fill adjusted", fill2);
}

// --- Still: capture mid-complete (confetti + check) for a lively card cover ---
await page.keyboard.press("c"); // first eligible bot → done
await page.waitForTimeout(550); // confetti peak
const stillPath = join(RAW, "still-full.png");
await page.screenshot({ path: stillPath, fullPage: false, type: "png" });
console.log("still captured");

// Settle back to idle before the loop so first/last frames match
await page.waitForTimeout(2800);
await page.keyboard.press("i");
await page.waitForTimeout(500);

// --- Loop recording: idle → complete → settle idle (≈5s) ---
// Restart video by closing/reopening context is heavy; instead record continuous and trim.
// Mark t0 after idle settle, then trigger complete and wait out settle + idle hold.
const loopStart = Date.now();
await page.waitForTimeout(400); // brief idle hold at start
await page.keyboard.press("c");
await page.waitForTimeout(3200); // done hold ~2.8s + settle
await page.keyboard.press("i");
await page.waitForTimeout(600); // idle end hold
const loopEnd = Date.now();
console.log("loop window ms", loopEnd - loopStart);

const videoPath = await page.video().path();
await ctx.close();
await browser.close();
killSrv();

writeFileSync(join(RAW, "meta.json"), JSON.stringify({ fill, loopMs: loopEnd - loopStart, videoPath, stillPath }, null, 2));
console.log("raw video", videoPath);
console.log("done raw capture");
