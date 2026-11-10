import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PORT = 3148;
const RAW = "/tmp/ap-card-loop";
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
}

const W = 1280, H = 720;
const browser = await chromium.launch({ headless: true });

// Prep page without recording, then start a fresh context for the loop only
{
  const prep = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await prep.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/desktop/`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: `
    html, body, .desktop-stage {
      background: radial-gradient(ellipse 90% 70% at 50% 42%, #1c1830 0%, #12101c 48%, #0a090f 100%) !important;
    }
    .desktop-anchor {
      left: 50% !important; top: 50% !important; margin: 0 !important;
      transform: translate(-50%, -50%) scale(3.18) !important;
      transform-origin: center center !important;
    }
    .desktop-restore { display: none !important; }
  ` });
  await page.waitForSelector("[data-desktop-pill]");
  await page.locator("[data-desktop-pill]").focus();
  await page.keyboard.press("2");
  await page.waitForTimeout(400);
  await page.keyboard.press("i");
  await page.waitForTimeout(300);
  const pct = await page.locator("[data-desktop-pill]").evaluate(el => el.getBoundingClientRect().width / innerWidth);
  console.log("prep fill", pct);
  await prep.close();
}

const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1, // video is CSS pixels; keep crisp via high bitrate + later scale
  recordVideo: { dir: RAW, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/desktop/`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: `
  html, body, .desktop-stage {
    background: radial-gradient(ellipse 90% 70% at 50% 42%, #1c1830 0%, #12101c 48%, #0a090f 100%) !important;
  }
  .desktop-anchor {
    left: 50% !important; top: 50% !important; margin: 0 !important;
    transform: translate(-50%, -50%) scale(3.18) !important;
    transform-origin: center center !important;
  }
  .desktop-restore { display: none !important; }
` });
await page.waitForSelector("[data-desktop-pill]");
await page.locator("[data-desktop-pill]").focus();
await page.keyboard.press("2");
await page.waitForTimeout(500);
await page.keyboard.press("i");
await page.waitForTimeout(700);

// Seamless loop body: idle hold → complete → settle → idle hold
const t0 = Date.now();
await page.waitForTimeout(600);
await page.keyboard.press("c");
await page.waitForTimeout(3000);
await page.keyboard.press("i");
await page.waitForTimeout(700);
const t1 = Date.now();
console.log("recorded ms", t1 - t0);

const videoPath = await page.video().path();
await ctx.close();
await browser.close();
killSrv();
writeFileSync(join(RAW, "meta.json"), JSON.stringify({ videoPath, recordedMs: t1 - t0 }, null, 2));
console.log("video", videoPath);
