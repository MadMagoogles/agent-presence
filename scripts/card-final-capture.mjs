/** Final portfolio card still + seamless loop. Dark style, rest (no ×), clean dark backdrop. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 3149;
const OUT = "/workspace/empire/agent-presence/screens";
const RAW = "/tmp/ap-card-final";
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
}

const STYLE = `
  html, body, .desktop-stage {
    background: radial-gradient(ellipse 90% 70% at 50% 42%, #1c1830 0%, #12101c 48%, #0a090f 100%) !important;
  }
  .desktop-anchor {
    left: 50% !important; top: 50% !important; margin: 0 !important;
    transform: translate(-50%, -50%) scale(3.18) !important;
    transform-origin: center center !important;
  }
  .desktop-restore { display: none !important; }
`;

async function prep(page) {
  await page.goto(`http://127.0.0.1:${PORT}/desktop/`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: STYLE });
  await page.waitForSelector("[data-desktop-pill]");
  // Focus briefly to accept keys, set Dark + idle, then blur so × stays hidden (rest state).
  await page.locator("[data-desktop-pill]").focus();
  await page.keyboard.press("2");
  await page.waitForTimeout(350);
  await page.keyboard.press("i");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const el = document.querySelector("[data-desktop-pill]");
    el?.blur();
    document.body.focus();
  });
  // Move mouse away so hover doesn't open
  await page.mouse.move(20, 20);
  await page.waitForTimeout(350);
}

const browser = await chromium.launch({ headless: true });
const W = 1280, H = 720;

// ---- STILL (dpr 2) ----
{
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await prep(page);
  const pct = await page.locator("[data-desktop-pill]").evaluate(el => el.getBoundingClientRect().width / innerWidth);
  console.log("still fill", pct);
  // Trigger complete without focusing the pill: dispatch trusted-like via page.evaluate on the app's key path is blocked (isTrusted).
  // Use mouse-free approach: temporarily focus body and press c — desktop key handler listens on window and checks isTrusted (Playwright keys are trusted).
  await page.keyboard.press("c");
  await page.waitForTimeout(500);
  // Ensure still rest (no focus/hover ×)
  await page.mouse.move(20, 20);
  await page.evaluate(() => document.querySelector("[data-desktop-pill]")?.blur());
  await page.waitForTimeout(80);
  await page.screenshot({ path: join(RAW, "still-full.png"), type: "png" });
  // Also grab idle still for comparison
  await page.waitForTimeout(2800);
  await page.keyboard.press("i");
  await page.mouse.move(20, 20);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(RAW, "still-idle.png"), type: "png" });
  await ctx.close();
}

// ---- LOOP VIDEO ----
{
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  await prep(page);
  await page.waitForTimeout(500); // idle start
  await page.keyboard.press("c");
  await page.waitForTimeout(3000);
  await page.keyboard.press("i");
  await page.mouse.move(20, 20);
  await page.waitForTimeout(700); // idle end
  const videoPath = await page.video().path();
  writeFileSync(join(RAW, "video-path.txt"), videoPath);
  await ctx.close();
  console.log("loop video", videoPath);
}

await browser.close();
killSrv();
console.log("raw done");
