import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PORT = 3150;
const srv = spawn(process.execPath, ["scripts/serve-static.mjs"], {
  cwd: "/workspace/empire/agent-presence-overlay",
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});
const kill = () => { try { process.kill(srv.pid); } catch {} };
process.on("exit", kill);
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/desktop/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
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
  .desktop-close { opacity: 0 !important; pointer-events: none !important; }
` });
await page.waitForSelector("[data-desktop-pill]");
await page.locator("[data-desktop-pill]").focus();
await page.keyboard.press("2");
await page.waitForTimeout(400);
await page.keyboard.press("i");
await page.waitForTimeout(300);
await page.mouse.move(10, 10);
await page.evaluate(() => document.querySelector("[data-desktop-pill]")?.blur());
await page.waitForTimeout(200);
await page.keyboard.press("c");
await page.waitForTimeout(220); // confetti early peak
await page.mouse.move(10, 10);
await page.screenshot({ path: "/tmp/ap-card-final/still-complete-hi.png", type: "png" });
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/ap-card-final/still-complete-hi2.png", type: "png" });
await ctx.close(); await browser.close(); kill();
console.log("still ok");
