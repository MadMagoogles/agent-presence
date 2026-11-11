// Desktop close-button hug: pill hugs bots at rest, expands on hover/focus, grows left at the right edge.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 3130;
const URL = `http://127.0.0.1:${PORT}/`;
const srv = spawn(process.execPath, ["scripts/serve-static.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});
const killSrv = () => { try { process.kill(srv.pid); } catch {} };
process.on("exit", killSrv);
for (let i = 0; i < 60; i++) {
  try { await fetch(URL); break; } catch { await new Promise(r => setTimeout(r, 250)); }
}

const report = { checks: [] };
const check = (name, ok, extra = "") => {
  report.checks.push({ name, ok: !!ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
async function axePage(page, name) {
  const r = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const ids = r.violations.map(v => `${v.id}(${v.nodes.length})`).join(" ");
  check(`${name} axe 0 violations`, r.violations.length === 0, ids || "0");
}

async function metrics(page) {
  return page.evaluate(() => {
    const ov = document.querySelector("[data-overlay]");
    if (!ov) return null;
    const bots = [...ov.querySelectorAll("[data-agent]")];
    const o = ov.getBoundingClientRect();
    const first = bots[0].getBoundingClientRect();
    const last = bots[bots.length - 1].getBoundingClientRect();
    const close = ov.querySelector("[data-close-overlay]");
    const cs = close ? getComputedStyle(close) : null;
    const cr = close ? close.getBoundingClientRect() : null;
    const slot = close?.parentElement;
    const slotW = slot ? slot.getBoundingClientRect().width : 0;
    const closeVisible = !!(close && slotW > 8 && cr && cr.width > 8 && cs.visibility !== "hidden");
    return {
      ox: o.x, oy: o.y, ow: o.width, oh: o.height, or: o.x + o.width,
      leftGap: first.x - o.x,
      rightGap: o.x + o.width - (last.x + last.width),
      firstX: first.x, lastR: last.x + last.width,
      close: cr ? { x: cr.x, r: cr.x + cr.width, w: cr.width, visible: closeVisible } : null,
      expandLeft: ov.getAttribute("data-expand-left"),
      open: ov.getAttribute("data-open"),
      scale: Number(ov.getAttribute("data-demo-scale") || 1),
      pinned: ov.getAttribute("data-pinned"),
      vw: window.innerWidth,
    };
  });
}

async function resetPage(page) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("agent-overlay-pos");
    localStorage.removeItem("agent-presence.bg");
    localStorage.removeItem("agent-presence.widgetSize");
    localStorage.removeItem("agent-presence.botStyle");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.mouse.move(8, 800);
  await page.waitForTimeout(500);
  await page.waitForSelector("[data-overlay]");
}

async function leave(page) {
  await page.mouse.move(8, 800);
  await page.waitForTimeout(280);
}

async function tabFocusOverlay(page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const reached = await page.evaluate(() => {
      const ov = document.querySelector("[data-overlay]");
      const el = document.activeElement;
      return !!(ov && el && (el === ov || ov.contains(el)));
    });
    if (reached) return;
  }
  throw new Error("could not Tab to the agents overlay");
}

const browser = await chromium.launch();
const logs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("console", msg => { if (msg.type() === "error") logs.push(msg.text()); });
  page.on("pageerror", err => logs.push(String(err)));

  await resetPage(page);

  const rest = await metrics(page);
  const pad = 8 * rest.scale;
  check("at rest pill hugs bots (no close gap)", rest && rest.rightGap < pad + 6 && rest.leftGap < pad + 12 && Math.abs(rest.rightGap - pad) <= 4, `leftGap=${rest?.leftGap?.toFixed(1)} rightGap=${rest?.rightGap?.toFixed(1)} w=${rest?.ow?.toFixed(1)}`);
  check("at rest close button is not visible", rest.open === "false" && !rest.close?.visible && (await page.getByRole("button", { name: "Hide agents overlay" }).count()) === 0, `open=${rest.open} close=${JSON.stringify(rest.close)}`);
  check("at rest expand-left is false (center)", rest.expandLeft === "false");
  await page.screenshot({ path: "screens/widget-hug-rest.png" });

  const ov = page.locator("[data-overlay]");
  const b0 = await ov.boundingBox();
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.waitForTimeout(280);
  const hover = await metrics(page);
  check("hover expands width ~40px and shows close", hover.open === "true" && hover.close?.visible && Math.abs(hover.ow - rest.ow - 40 * rest.scale) <= 3, `dW=${(hover.ow - rest.ow).toFixed(1)} close=${JSON.stringify(hover.close)}`);
  check("center hover expands right (left edge and bots stay)", hover.expandLeft === "false" && Math.abs(hover.ox - rest.ox) <= 2 && Math.abs(hover.firstX - rest.firstX) <= 2, `ox ${rest.ox.toFixed(1)}→${hover.ox.toFixed(1)} firstX ${rest.firstX.toFixed(1)}→${hover.firstX.toFixed(1)}`);
  check("center hover close sits to the right of the bots", hover.close.x >= hover.lastR - 2, `close.x=${hover.close.x.toFixed(1)} lastR=${hover.lastR.toFixed(1)}`);
  await page.screenshot({ path: "screens/widget-hug-hover.png" });

  // Drag, release, then move away — leftover mouse focus must not keep the × visible.
  const dragBox = await ov.boundingBox();
  await page.mouse.move(dragBox.x + 24, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + 80, dragBox.y + dragBox.height / 2 + 30, { steps: 16 });
  await page.mouse.up();
  await leave(page);
  const afterDrag = await metrics(page);
  check("drag then move away collapses", afterDrag && afterDrag.open === "false" && !afterDrag.close?.visible, `open=${afterDrag?.open} close=${JSON.stringify(afterDrag?.close)} w=${afterDrag?.ow?.toFixed(1)}`);
  await page.screenshot({ path: "screens/widget-after-drag.png" });
  await page.evaluate(() => localStorage.removeItem("agent-overlay-pos"));
  await page.reload({ waitUntil: "networkidle" });
  await leave(page);
  await page.waitForSelector("[data-overlay]");
  await page.waitForTimeout(300);

  const closeBox = await ov.boundingBox();
  await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
  await page.waitForTimeout(280);
  await page.getByRole("button", { name: "Hide agents overlay" }).click();
  await page.waitForTimeout(400);
  check("close button hides the overlay", await ov.count() === 0 && await page.locator("[data-restore]").isVisible());
  await page.locator("[data-restore]").click();
  await page.waitForTimeout(400);
  check("restore chip brings the overlay back", await ov.count() === 1);
  const reopened = await metrics(page);
  check("close then reopen starts collapsed", reopened && reopened.open === "false" && !reopened.close?.visible, `open=${reopened?.open} close=${JSON.stringify(reopened?.close)} w=${reopened?.ow?.toFixed(1)}`);
  await page.screenshot({ path: "screens/widget-reopen.png" });
  await leave(page);

  // Keyboard (Tab) focus reveals the close button without hover. Programmatic focus must not.
  await page.evaluate(() => document.querySelector("[data-play-button]")?.focus());
  await leave(page);
  await page.waitForFunction(() => document.querySelector("[data-overlay]")?.getAttribute("data-open") === "false");
  const rest2 = await metrics(page);
  await ov.focus();
  await page.waitForTimeout(280);
  const mouseFocused = await metrics(page);
  check("programmatic focus does not expand", mouseFocused.open === "false" && !mouseFocused.close?.visible, `open=${mouseFocused.open} w=${mouseFocused.ow.toFixed(1)}`);
  await tabFocusOverlay(page);
  await page.waitForTimeout(280);
  const focused = await metrics(page);
  check("Tab focus still expands", focused.open === "true" && focused.close?.visible && focused.ow > rest2.ow + 20, `dW=${(focused.ow - rest2.ow).toFixed(1)} active=${await page.evaluate(() => document.activeElement && (document.activeElement.getAttribute("data-overlay") != null ? "overlay" : document.activeElement.getAttribute("aria-label") || document.activeElement.tagName))}`);
  const closeTabbable = await page.locator("[data-close-overlay]").evaluate(el => el.tabIndex >= 0 && el.getAttribute("aria-hidden") !== "true");
  check("close button is tabbable while the overlay is focused", closeTabbable);
  await page.evaluate(() => document.querySelector("[data-play-button]")?.focus());
  await page.waitForTimeout(280);
  const blurred = await metrics(page);
  check("blur collapses the close slot", blurred && !blurred.close?.visible && Math.abs(blurred.ow - rest2.ow) <= 2, `w=${blurred?.ow?.toFixed(1)} rest=${rest2.ow.toFixed(1)}`);
  await leave(page);

  // Drag to the right edge, collapse, then hover — should grow left with no overflow.
  const box = await ov.boundingBox();
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(1420, box.y + box.height / 2, { steps: 28 });
  await page.mouse.up();
  await leave(page);
  const rightRest = await metrics(page);
  check("dragged to right edge at rest", rightRest && rightRest.or > 1440 - 20 && rightRest.or <= 1440, `right=${rightRest?.or?.toFixed(1)}`);
  check("right-edge drag then release collapses", rightRest && rightRest.open === "false" && !rightRest.close?.visible, `open=${rightRest?.open} close=${JSON.stringify(rightRest?.close)}`);
  const rb = await ov.boundingBox();
  // Hover the left half first so, once it grows left, the cursor lands on the close slot, not a bot.
  await page.mouse.move(rb.x + 16, rb.y + rb.height / 2);
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: "[data-radix-popper-content-wrapper],[data-radix-tooltip-content]{display:none!important}" });
  const rightHover = await metrics(page);
  check("right-edge hover expands left", rightHover.expandLeft === "true" && rightHover.close?.visible, `expandLeft=${rightHover.expandLeft}`);
  check("right-edge hover anchors the right edge (no jump, no overflow)", Math.abs(rightHover.or - rightRest.or) <= 3 && rightHover.or <= 1440 + 0.5 && rightHover.ox >= -0.5, `restR=${rightRest.or.toFixed(1)} hoverR=${rightHover.or.toFixed(1)} hoverL=${rightHover.ox.toFixed(1)}`);
  check("right-edge hover close sits to the left of the bots", rightHover.close.r <= rightHover.firstX + 2, `close.r=${rightHover.close.r.toFixed(1)} firstX=${rightHover.firstX.toFixed(1)}`);
  check("right-edge hover bots stay put", Math.abs(rightHover.lastR - rightRest.lastR) <= 2 && Math.abs(rightHover.firstX - rightRest.firstX) <= 2, `firstX ${rightRest.firstX.toFixed(1)}→${rightHover.firstX.toFixed(1)}`);
  await page.screenshot({ path: "screens/widget-hug-right-edge-hover.png" });
  await leave(page);

  // Left position still expands right. Reset first so we drag from a known hugged center.
  await page.evaluate(() => document.querySelector("[data-play-button]")?.focus());
  await leave(page);
  await page.evaluate(() => localStorage.removeItem("agent-overlay-pos"));
  await page.reload({ waitUntil: "networkidle" });
  await leave(page);
  await page.waitForSelector("[data-overlay]");
  await page.waitForTimeout(300);
  const mid = await ov.boundingBox();
  await page.mouse.move(mid.x + Math.min(40, mid.width / 2), mid.y + mid.height / 2);
  await page.mouse.down();
  await page.mouse.move(48, mid.y + mid.height / 2, { steps: 24 });
  await page.mouse.up();
  await page.evaluate(() => document.querySelector("[data-play-button]")?.focus());
  await leave(page);
  await page.waitForFunction(() => document.querySelector("[data-overlay]")?.getAttribute("data-open") === "false");
  const leftRest = await metrics(page);
  const lbb = await ov.boundingBox();
  await page.mouse.move(lbb.x + lbb.width / 2, lbb.y + lbb.height / 2);
  await page.waitForTimeout(280);
  const leftHover = await metrics(page);
  check("left position expands right", leftHover.expandLeft === "false" && Math.abs(leftHover.ox - leftRest.ox) <= 2 && leftHover.ow > leftRest.ow + 20 && leftRest.ox < 120, `expandLeft=${leftHover.expandLeft} restX=${leftRest.ox.toFixed(1)} dW=${(leftHover.ow - leftRest.ow).toFixed(1)}`);
  await leave(page);

  // Widget sizes and bot styles: hug at rest, expand on hover, no errors.
  for (const size of ["s", "m", "l"]) {
    await page.locator(`[data-size-option="${size}"]`).click();
    await leave(page);
    await page.waitForTimeout(200);
    const sRest = await metrics(page);
    const expectedPad = 8 * sRest.scale;
    const sb = await ov.boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(280);
    const sHover = await metrics(page);
    check(`size ${size} hugs at rest`, Math.abs(sRest.rightGap - expectedPad) <= 4, `rightGap=${sRest.rightGap.toFixed(1)} expected~${expectedPad}`);
    check(`size ${size} expands ~40×scale on hover`, Math.abs(sHover.ow - sRest.ow - 40 * sRest.scale) <= 4 && sHover.close?.visible, `dW=${(sHover.ow - sRest.ow).toFixed(1)} need=${(40 * sRest.scale).toFixed(1)}`);
    await leave(page);
  }
  await page.locator('[data-size-option="s"]').click();
  await leave(page);

  for (const style of ["default", "frosted", "dark", "iridescent", "aurora"]) {
    await page.locator(`[data-style-option="${style}"]`).click();
    await leave(page);
    await page.waitForTimeout(200);
    const stRest = await metrics(page);
    const stb = await ov.boundingBox();
    await page.mouse.move(stb.x + stb.width / 2, stb.y + stb.height / 2);
    await page.waitForTimeout(280);
    const stHover = await metrics(page);
    check(`style ${style} rest+hover render`, stRest && stHover && stHover.close?.visible && stHover.ow > stRest.ow + 20, `restW=${stRest?.ow?.toFixed(1)} hoverW=${stHover?.ow?.toFixed(1)}`);
    await leave(page);
  }

  await axePage(page, "desktop / after hug");
  check("desktop no console errors", logs.length === 0, logs.join(" | "));
  await context.close();

  // Mobile is unchanged: no close button, pinned, screenshot vs v4 baseline.
  const mobileLogs = [];
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mp = await mobile.newPage();
  mp.on("console", msg => { if (msg.type() === "error") mobileLogs.push(msg.text()); });
  mp.on("pageerror", err => mobileLogs.push(String(err)));
  await mp.goto(URL, { waitUntil: "networkidle" });
  await mp.waitForTimeout(800);
  const mMeta = await mp.evaluate(() => {
    const ov = document.querySelector("[data-overlay]");
    const stage = document.querySelector("[data-demo-stage]");
    const close = ov?.querySelector("[data-close-overlay], [aria-label='Hide agents overlay']");
    const o = ov?.getBoundingClientRect();
    const s = stage?.getBoundingClientRect();
    const bots = ov ? ov.querySelectorAll("[data-agent]").length : 0;
    const inStage = !!(o && s && o.width > 100 && o.y >= s.y - 1 && o.y + o.height <= s.y + s.height + 2);
    return { pinned: ov?.getAttribute("data-pinned"), close: !!close, bots, inStage, ox: o?.x, oy: o?.y, ow: o?.width, oh: o?.height };
  });
  check("mobile has no close button and stays pinned", mMeta.pinned === "true" && mMeta.close === false, JSON.stringify(mMeta));
  check("mobile widget is visible in the stage", mMeta.inStage && mMeta.bots === 4, JSON.stringify(mMeta));
  await mp.screenshot({ path: "screens/widget-hug-mobile-375.png" });
  // Controls panel below the stage should match the v4 layout (ignore the restaged wallpaper).
  const baseline = "screens/mobile-v4-375-top.png";
  if (existsSync(baseline)) {
    const py = spawnSync("python3", ["scripts/pixel-diff-crop.py", baseline, "screens/widget-hug-mobile-375.png", "700"], { encoding: "utf-8" });
    const parts = (py.stdout || "").trim().split(/\s+/);
    const mismatch = Number(parts[0]), total = Number(parts[1]);
    const ok = py.status === 0 && mismatch === 0;
    check("mobile controls panel unchanged vs v4", ok, py.status !== 0 ? (py.stderr || py.stdout || "diff failed").trim() : `${mismatch}/${total} pixels`);
  } else {
    check("mobile controls panel unchanged vs v4", false, "missing baseline");
  }
  await axePage(mp, "mobile /");
  check("mobile no console errors", mobileLogs.length === 0, mobileLogs.join(" | "));
  await mobile.close();

  // Short hover clip: rest → hover at center, then right-edge expand left.
  const tmp = resolve("screens/_vid-hug");
  mkdirSync(tmp, { recursive: true });
  const vctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: tmp, size: { width: 1440, height: 900 } } });
  const v = await vctx.newPage();
  await v.goto(URL, { waitUntil: "networkidle" });
  await v.evaluate(() => { localStorage.removeItem("agent-overlay-pos"); });
  await v.reload({ waitUntil: "networkidle" });
  await v.mouse.move(8, 800);
  await v.waitForTimeout(700);
  let vb = await v.locator("[data-overlay]").boundingBox();
  await v.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2, { steps: 18 });
  await v.waitForTimeout(900);
  await v.mouse.move(8, 800, { steps: 14 });
  await v.waitForTimeout(500);
  vb = await v.locator("[data-overlay]").boundingBox();
  await v.mouse.move(vb.x + 24, vb.y + vb.height / 2, { steps: 8 });
  await v.mouse.down();
  await v.mouse.move(1420, vb.y + vb.height / 2, { steps: 36 });
  await v.mouse.up();
  await v.mouse.move(8, 800, { steps: 10 });
  await v.waitForTimeout(400);
  vb = await v.locator("[data-overlay]").boundingBox();
  await v.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2, { steps: 16 });
  await v.waitForTimeout(1000);
  await v.mouse.move(8, 800, { steps: 12 });
  await v.waitForTimeout(600);
  await vctx.close();
  const webm = spawnSync("bash", ["-lc", `ls -t ${tmp}/*.webm | head -1`], { encoding: "utf-8" }).stdout.trim();
  const out = "screens/widget-hug.mp4";
  if (!webm) check("recorded hug clip", false, "no webm");
  else {
    const ff = spawnSync("ffmpeg", ["-y", "-i", webm, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { encoding: "utf-8" });
    check("recorded hug clip", ff.status === 0 && existsSync(out), ff.status !== 0 ? (ff.stderr || "").slice(-200) : out);
  }
  rmSync(tmp, { recursive: true, force: true });
} finally {
  await browser.close();
  killSrv();
}

const failed = report.checks.filter(c => !c.ok);
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} passed`);
if (failed.length) {
  process.exitCode = 1;
  console.log("Failures:\n" + failed.map(c => ` - ${c.name}${c.extra ? " — " + c.extra : ""}`).join("\n"));
}
