/** Capture /lab at 2560×1440 for demo-scale comparison (1× / 1.5× / 2×). */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = 3125, LAB = `http://localhost:${PORT}/lab`;
const OUT = "screens/scale";
mkdirSync(OUT, { recursive: true });
const win = process.platform === "win32";
const srv = spawn(`npx next start -p ${PORT}`, { stdio: "ignore", detached: !win, shell: true });
const killSrv = () => { try { win ? spawnSync("taskkill", ["/pid", String(srv.pid), "/T", "/F"], { stdio: "ignore" }) : process.kill(-srv.pid); } catch {} };
process.on("exit", killSrv);
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise(r => setTimeout(r, 500)); } }

const browser = await chromium.launch();
const scales = [1, 1.5, 2];
const meta = {};
const W = 2560, H = 1440;

for (const sc of scales) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${LAB}?style=dark&still=1&scale=${sc}&rm=1`);
  await page.evaluate(({ sc }) => {
    localStorage.clear();
    localStorage.setItem("agent-presence.lab.desktopSafe", "1");
    localStorage.setItem("agent-presence.lab.demoScale", String(sc));
    localStorage.setItem("agent-overlay-pos", JSON.stringify({ x: 1100, y: 200 }));
    localStorage.setItem("agent-presence.lab", JSON.stringify({ active: "dark", backdrop: "busy", scale: sc, tri: "violet" }));
  }, { sc });
  await page.goto(`${LAB}?style=dark&still=1&scale=${sc}&rm=1`);
  await page.waitForTimeout(800);

  const collapse = page.getByRole("button", { name: "Collapse panel" });
  if (await collapse.isVisible().catch(() => false)) await collapse.click();
  await page.waitForTimeout(300);

  const openBtn = page.locator("[data-open-panel]");
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click(); await page.waitForTimeout(350);
    await page.getByRole("tab", { name: /Dark glass/ }).click().catch(() => {});
    await page.getByRole("radio", { name: "Busy UI" }).click().catch(() => {});
    const hover = page.getByRole("button", { name: /Hover state/ });
    if (await hover.isVisible().catch(() => false)) {
      if ((await hover.getAttribute("aria-pressed")) !== "true") await hover.click();
    }
    await page.getByRole("button", { name: "Collapse panel" }).click();
    await page.waitForTimeout(500);
  }

  const ov = page.locator("[data-overlay]");
  await ov.waitFor({ state: "visible" });
  const x = Math.round((W - 260 * sc) / 2);
  const y = 220;
  await page.evaluate(({ x, y }) => {
    localStorage.setItem("agent-overlay-pos", JSON.stringify({ x, y }));
    const el = document.querySelector("[data-overlay]");
    if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
  }, { x, y });
  await page.waitForTimeout(400);

  const sizes = await ov.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, ow: el.offsetWidth, oh: el.offsetHeight, scaleAttr: el.getAttribute("data-demo-scale"), left: r.left, top: r.top };
  });
  meta[String(sc)] = sizes;
  const tag = String(sc).replace(".", "p");
  await page.screenshot({ path: `${OUT}/full-${tag}x-2560.png`, fullPage: false });
  console.log(`captured ${sc}×`, sizes);
  await ctx.close();
}

await browser.close();
killSrv();
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2));
console.log("done");
