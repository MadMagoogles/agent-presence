// Usage: npm run build && npm run a11y  (next start :3124, axe on scenes, behaviour checks, screens + hero video)
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, renameSync, readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";

const PORT = 3124, URL = `http://localhost:${PORT}/`;
const win = process.platform === "win32";
// Tauri's Next static export cannot be served by `next start`. Serve out/ using
// built-in Node APIs (no install), while retaining the normal Next launcher.
const staticServer = `
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const root = resolve('out');
const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain'};
createServer((req,res) => { try {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403); return res.end(); }
  if (statSync(path).isDirectory()) path += '/index.html';
  res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(readFileSync(path));
} catch { res.writeHead(404); res.end('Not found'); } }).listen(${PORT},'127.0.0.1');`;
const srv = existsSync('out/index.html')
  ? spawn(process.execPath, ['--input-type=module', '-e', staticServer], { stdio: 'ignore', detached: !win })
  : spawn(`npx next start -p ${PORT}`, { stdio: "ignore", detached: !win, shell: true });
const killSrv = () => { try { win ? spawnSync("taskkill", ["/pid", String(srv.pid), "/T", "/F"], { stdio: "ignore" }) : process.kill(-srv.pid); } catch {} };
process.on("exit", killSrv);
for (let i = 0; i < 60; i++) { try { await fetch(URL); break; } catch { await new Promise(r => setTimeout(r, 500)); } }

const browser = await chromium.launch();
const vp = { width: 1200, height: 675 };
const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
const report = { axe: {}, checks: [] };
const check = (name, ok) => { report.checks.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); };
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const axe = async (name) => { const r = await new AxeBuilder({ page }).withTags(tags).analyze();
  report.axe[name] = r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.html.slice(0, 160)) }));
  console.log(`axe ${name}: ${r.violations.length}`, r.violations.map(v => `${v.id}(${v.nodes.length})`).join(" ")); };

await page.goto(`${URL}?scene=states`); await page.waitForTimeout(1200);
await axe("states"); await page.screenshot({ path: "screens/states.png" });
await page.goto(`${URL}?scene=states&rm=1`); await page.waitForTimeout(600);
await axe("states-reduced"); await page.screenshot({ path: "screens/states-reduced-motion.png" });

// Keyboard: Tab to a bot → tooltip; Enter → popover with ToolCallCard; approve
await page.goto(`${URL}?scene=states`); await page.waitForTimeout(600);
const moss = page.locator('[data-agent="moss"]');
await moss.focus(); await page.waitForTimeout(500);
check("bot is keyboard focusable", await moss.evaluate(el => el === document.activeElement));
check("focus shows tooltip with name + verb, target", (await page.getByRole("tooltip").textContent())?.includes("Deploy, v2.4 to staging"));
await page.screenshot({ path: "screens/tooltip.png" });
await page.keyboard.press("Enter"); await page.waitForTimeout(500);
const pop = page.getByRole("dialog", { name: "Moss details" });
check("Enter opens detail popover", await pop.isVisible());
check("popover reuses ToolCallCard (Awaiting approval)", await pop.getByText("Awaiting approval", { exact: true }).isVisible());
await axe("popover"); await page.screenshot({ path: "screens/popover-needs-you.png" });
await pop.getByRole("button", { name: "Approve" }).click(); await page.waitForTimeout(300);
check("approve → working + announced", (await moss.getAttribute("data-status")) === "working" && (await page.locator("p[role=status]:not([data-overlay-status])").textContent()).includes("Approved"));
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
check("Escape closes popover", (await page.getByRole("dialog").count()) === 0);
check("bot aria-label carries status + activity text", (await page.locator('[data-agent="wren"]').getAttribute("aria-label")).includes("Error. Running, test suite"));

// Director: handoff is off by default; Working trigger + tuning panel exist
await page.goto(`${URL}?scene=idle`); await page.waitForTimeout(400);
check("handoff trigger hidden while handoff animation is off", (await page.getByRole("button", { name: "Handoff" }).count()) === 0);
check("animation tuning panel present", await page.getByRole("heading", { name: "Animation tuning" }).isVisible());
await page.getByRole("button", { name: "Working", exact: true }).click(); await page.waitForTimeout(250);
check("working trigger → a bot is working", (await page.locator('[data-status="working"]').count()) >= 1);
await page.getByRole("checkbox", { name: "Status summary text" }).uncheck();
check("status summary text can be hidden", (await page.getByText("1 working").count()) === 0);
await page.getByRole("checkbox", { name: "Status summary text" }).check();

// Director: trigger handoff announces message (handoff enabled via saved tuning)
await page.evaluate(() => localStorage.setItem("agent-presence.anim", JSON.stringify({ handoff: { enabled: true } })));
await page.goto(`${URL}?scene=idle`); await page.waitForTimeout(400);
await page.getByRole("button", { name: "Handoff" }).click(); await page.waitForTimeout(250);
check("handoff trigger announces sender → receiver", / to .*Handing off/.test(await page.locator("p[role=status]:not([data-overlay-status])").textContent()));
await page.screenshot({ path: "screens/handoff-bubble.png" });
await page.getByRole("button", { name: "Complete" }).click(); await page.waitForTimeout(250);
check("complete trigger → a bot is done", (await page.locator('[data-status="done"]').count()) >= 1);
await page.screenshot({ path: "screens/complete-confetti.png" });
await page.getByRole("button", { name: "Play" }).click(); await page.waitForTimeout(3200);
check("done settles back to idle after hold", (await page.locator('[data-status="done"]').count()) === 0);

// Overlay: default → hover → drag → keyboard move → hide → restore
await page.goto(`${URL}?scene=states`); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.mouse.move(5, 660); await page.waitForTimeout(900);
const ov = page.locator("[data-overlay]");
const b0 = await ov.boundingBox();
check("overlay defaults to top centre", Math.abs(b0.x + b0.width / 2 - vp.width / 2) < 4 && b0.y < 140);
check("no hide button in default state", (await page.getByRole("button", { name: "Hide agents overlay" }).count()) === 0);
// mockup-comparison shots use the calm idle scene
const ip = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
await ip.goto(`${URL}?scene=idle`); await ip.mouse.move(5, 660); await ip.waitForTimeout(900);
const ib = await ip.locator("[data-overlay]").boundingBox();
await ip.screenshot({ path: "screens/default.png" });
await ip.screenshot({ path: "screens/default-zoom.png", clip: { x: ib.x - 40, y: ib.y - 30, width: ib.width + 120, height: ib.height + 60 } });
await ip.mouse.move(ib.x + ib.width - 60, ib.y + 6); await ip.waitForTimeout(600);
await ip.screenshot({ path: "screens/hover.png" });
await ip.screenshot({ path: "screens/hover-zoom.png", clip: { x: ib.x - 40, y: ib.y - 30, width: ib.width + 120, height: ib.height + 60 } });
await ip.close();
await page.mouse.move(b0.x + 20, b0.y + b0.height / 2); await page.waitForTimeout(600);
const b1 = await ov.boundingBox();
check("hover reserves pill width and shows × hide button", Math.abs(b1.width-b0.width)<1 && await page.getByRole("button", { name: "Hide agents overlay" }).isVisible());
check("hover has no bottom drag handle", await page.locator('[data-overlay]').evaluate(el => ![...el.querySelectorAll('span')].some(e => e.className?.includes?.('bottom-[5px]'))));
check("hover cursor is default on pill and bots", await page.locator('[data-overlay], [data-overlay] [data-agent]').evaluateAll(es => es.every(e => getComputedStyle(e).cursor === 'default')));
await page.screenshot({path:'screens/hover-no-handle.png'});
await axe("overlay-hover");
await page.screenshot({ path: "screens/hover-states.png" });
// small press-without-move on a bot still opens popover
await page.locator('[data-agent="juniper"]').click(); await page.waitForTimeout(400);
check("click (no drag) on bot opens popover", await page.getByRole("dialog", { name: "Juniper details" }).isVisible());
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
// drag from a bot
const jb = await page.locator('[data-agent="juniper"]').boundingBox();
await page.mouse.move(jb.x + 10, jb.y + 10); await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(jb.x + 10 - i * 30, jb.y + 10 + i * 30); await page.waitForTimeout(16); }
await page.mouse.up(); await page.waitForTimeout(400);
const b2 = await ov.boundingBox();
check("drag from a bot moves overlay", b2.x < b1.x - 200 && b2.y > b1.y + 200);
check("drag does not open popover", (await page.getByRole("dialog").count()) === 0);
check("position saved to localStorage", !!(await page.evaluate(() => localStorage.getItem("agent-overlay-pos"))));
await page.screenshot({ path: "screens/dragged.png" });
await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.down();
await page.mouse.move(-500, -500, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
const b3 = await ov.boundingBox();
check("drag is constrained to viewport", b3.x >= 0 && b3.y >= 0);
await page.reload(); await page.waitForTimeout(700);
const b4 = await ov.boundingBox();
check("position restored after reload", Math.abs(b4.x - b3.x) < 2 && Math.abs(b4.y - b3.y) < 2);
await ov.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+ArrowDown"); await page.waitForTimeout(150);
const b5 = await ov.boundingBox();
check("arrow keys move focused overlay (Shift = bigger)", Math.round(b5.x - b4.x) === 8 && Math.round(b5.y - b4.y) === 48);
check("move announced", (await page.locator("[data-overlay-status]").textContent()).includes("moved"));
await page.getByRole("button", { name: "Hide agents overlay" }).click(); await page.waitForTimeout(500);
check("× hides overlay", (await ov.count()) === 0);
check("hide announced + restore chip focused", (await page.locator("[data-overlay-status]").textContent()).includes("hidden") && await page.locator("[data-restore]").evaluate(el => el === document.activeElement));
check("restore chip signals needs-you while hidden", (await page.locator("[data-restore]").getAttribute("data-needs")) === "true");
await axe("hidden"); await page.screenshot({ path: "screens/hidden.png" });
await page.keyboard.press("Alt+Shift+KeyA"); await page.waitForTimeout(500);
check("Alt+Shift+A restores overlay", (await ov.count()) === 1 && (await page.locator("[data-overlay-status]").textContent()).includes("shown"));
await page.evaluate(() => localStorage.clear());

// Video: hover → drag → hide → restore
mkdirSync("screens/_vid", { recursive: true });
const vctx = await browser.newContext({ viewport: vp, recordVideo: { dir: "screens/_vid", size: vp } });
const v = await vctx.newPage(); await v.goto(URL); await v.mouse.move(40, 640); await v.waitForTimeout(2200);
const o = await v.locator("[data-overlay]").boundingBox();
await v.mouse.move(o.x + o.width / 2, o.y + o.height / 2, { steps: 25 }); await v.waitForTimeout(1200);
await v.mouse.move(o.x + 30, o.y + o.height / 2, { steps: 6 }); await v.mouse.down();
await v.mouse.move(o.x - 260, o.y + 300, { steps: 45 }); await v.mouse.up(); await v.waitForTimeout(900);
const x = await v.getByRole("button", { name: "Hide agents overlay" }).boundingBox();
await v.mouse.move(x.x + x.width / 2, x.y + x.height / 2, { steps: 15 }); await v.waitForTimeout(300); await v.mouse.down(); await v.mouse.up(); await v.waitForTimeout(1300);
const c = await v.locator("[data-restore]").boundingBox();
await v.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 25 }); await v.waitForTimeout(300); await v.mouse.down(); await v.mouse.up();
await v.mouse.move(600, 500, { steps: 10 }); await v.waitForTimeout(1600);
await vctx.close();
const f = readdirSync("screens/_vid")[0]; renameSync(`screens/_vid/${f}`, "screens/overlay-flow.webm"); rmSync("screens/_vid", { recursive: true });


// ---------- Style Lab (/lab): axe per tab + screenshots + tour video ----------
const LAB = `${URL}lab`;
const labIds = ["frosted", "dark", "iridescent", "aurora", "pixel", "refraction"];
const lvp = { width: 1440, height: 960 };
const lp = await (await browser.newContext({ viewport: lvp, deviceScaleFactor: 2 })).newPage();
const glErrors = []; lp.on("console", m => { if (m.type() === "error") glErrors.push(m.text()); });
await lp.goto(LAB); await lp.evaluate(() => localStorage.clear()); await lp.reload(); await lp.mouse.move(5, 940); await lp.waitForTimeout(900);
check("lab: route renders 6 style tabs", (await lp.getByRole("tab").count()) === 6);
check("lab: desktop-safe on by default, pixel + refraction disabled", (await lp.getByRole("switch", { name: "Desktop-safe styles only" }).getAttribute("aria-checked")) === "true"
  && (await lp.locator('[role=tab][aria-disabled=true]').count()) === 2);
await lp.keyboard.press("4"); check("lab: key 4 → aurora", (await lp.locator("main").getAttribute("data-lab-style")) === "aurora");
await lp.keyboard.press("]"); check("lab: ] wraps within safe set → frosted", (await lp.locator("main").getAttribute("data-lab-style")) === "frosted");
await lp.keyboard.press("5"); check("lab: key 5 ignored in safe mode", (await lp.locator("main").getAttribute("data-lab-style")) === "frosted");
await lp.evaluate(() => document.querySelector("aside .overflow-y-auto").scrollTop = 0); await axe("lab-safe-default"); await lp.screenshot({ path: "screens/lab-desktop-safe.png" });
await lp.getByRole("switch", { name: "Desktop-safe styles only" }).click();
await lp.keyboard.press("6"); check("lab: toggle off → key 6 → refraction", (await lp.locator("main").getAttribute("data-lab-style")) === "refraction");
check("lab: safe toggle saved", (await lp.evaluate(() => localStorage.getItem("agent-presence.lab.desktopSafe"))) === "0");
for (const [i, id] of labIds.entries()) {
  await lp.getByRole("tab").nth(i).click(); await lp.mouse.move(5, 940);
  await lp.getByRole("button", { name: "Hover state off" }).click(); await lp.waitForTimeout(500);
  await lp.getByRole("button", { name: "Task complete" }).click(); await lp.waitForTimeout(380);
  check(`lab: ${id} tab selected + only its controls shown`, (await lp.locator("main").getAttribute("data-lab-style")) === id && (await lp.locator(`[id^="f-"]:not([id^="f-${id}-"])`).count()) === 0);
  await lp.evaluate(() => document.querySelector("aside .overflow-y-auto").scrollTop = 0);
  await axe(`lab-${id}`); await lp.screenshot({ path: `screens/lab-${id}.png` });
  await lp.getByRole("button", { name: "Hover state pinned" }).click();
}
await lp.getByRole("tab", { name: "Frosted grain" }).focus(); await lp.keyboard.press("ArrowRight");
check("lab: arrow keys move between tabs", (await lp.locator("main").getAttribute("data-lab-style")) === "dark");
const blurBefore = await lp.locator("#f-dark-rimWidth").inputValue();
await lp.locator("#f-dark-rimWidth").fill("3"); await lp.getByRole("button", { name: "Reset" }).click();
check("lab: per-style reset restores defaults", (await lp.locator("#f-dark-rimWidth").inputValue()) === blurBefore);
await lp.getByRole("button", { name: "Save" }).click();
check("lab: save writes localStorage", !!(await lp.evaluate(() => localStorage.getItem("agent-presence.lab"))));
for (const b of ["Gradient", "Light"]) { await lp.getByRole("radio", { name: b }).click(); await lp.waitForTimeout(300); await axe(`lab-backdrop-${b}`); await lp.screenshot({ path: `screens/lab-backdrop-${b.split(" ")[0].toLowerCase()}.png` }); }
await lp.getByRole("button", { name: "Collapse panel" }).click(); await lp.waitForTimeout(1200);
check("lab: panel collapses", (await lp.getByRole("complementary").count()) === 0);
await axe("lab-collapsed"); await lp.screenshot({ path: "screens/lab-collapsed.png" });
await lp.goto(`${LAB}?style=aurora`); await lp.evaluate(() => localStorage.removeItem("agent-presence.lab")); await lp.reload(); await lp.mouse.move(5, 940); await lp.waitForTimeout(900);
{ const ob = await lp.locator("[data-overlay]").boundingBox(), ab = await lp.locator("[data-aurora]").boundingBox();
  check("lab: aurora clipped to pill bounds", Math.abs(ab.x - ob.x) < 2 && Math.abs(ab.width - ob.width) < 2 && (await lp.locator("[data-aurora]").evaluate(e => getComputedStyle(e).overflow)) === "hidden");
  await lp.screenshot({ path: "screens/lab-aurora-clipped.png" });
  await lp.mouse.move(ob.x + 20, ob.y + ob.height / 2); await lp.waitForTimeout(700); await axe("lab-aurora-hover");
  const oh = await lp.locator("[data-overlay]").boundingBox(), ah = await lp.locator("[data-aurora]").boundingBox();
  check("lab: aurora keeps reserved hover width", Math.abs(oh.width-ob.width)<1 && Math.abs(ah.width - oh.width) < 2);
  await lp.screenshot({ path: "screens/lab-aurora-clipped-hover.png" }); }
await lp.goto(`${LAB}?rm=1&style=iridescent`); await lp.waitForTimeout(600); await axe("lab-reduced");
check("lab: no WebGL/console errors", glErrors.length === 0);
if (glErrors.length) console.log(glErrors.slice(0, 5));
await lp.close();
mkdirSync("screens/_vid", { recursive: true });
const lctx = await browser.newContext({ recordVideo: { dir: "screens/_vid", size: { width: 1280, height: 853 } }, viewport: { width: 1280, height: 853 } });
const lv = await lctx.newPage(); await lv.goto(LAB); await lv.evaluate(() => localStorage.clear()); await lv.reload(); await lv.mouse.move(5, 660); await lv.waitForTimeout(1200);
for (const [i] of labIds.slice(0, 4).entries()) {
  const t = lv.getByRole("tab").nth(i), tb = await t.boundingBox();
  await lv.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 }); await lv.mouse.down(); await lv.mouse.up(); await lv.waitForTimeout(700);
  const o = await lv.locator("[data-overlay]").boundingBox();
  await lv.mouse.move(o.x + o.width / 2, o.y + o.height / 2, { steps: 14 }); await lv.waitForTimeout(700);
  const c = await lv.getByRole("button", { name: "Task complete" }).boundingBox();
  await lv.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 14 }); await lv.mouse.down(); await lv.mouse.up(); await lv.waitForTimeout(1300);
}
await lctx.close();
renameSync(`screens/_vid/${readdirSync("screens/_vid")[0]}`, "screens/lab-tour.webm"); rmSync("screens/_vid", { recursive: true });


// Demo scale control
{ const sp = await (await browser.newContext({ viewport: lvp })).newPage();
  await sp.goto(`${LAB}?style=dark&still=1&scale=1.5`); await sp.evaluate(() => localStorage.setItem("agent-presence.lab.desktopSafe", "0"));
  await sp.reload(); await sp.waitForTimeout(600);
  const ov = sp.locator("[data-overlay]");
  check("demo scale from ?scale= sets data-demo-scale", await ov.getAttribute("data-demo-scale") === "1.5");
  const box = await ov.boundingBox();
  // getBoundingClientRect includes CSS transform scale
  const scaled = await ov.evaluate(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, ow: el.offsetWidth, oh: el.offsetHeight }; });
  check("demo scale 1.5× grows visual box ~1.5× layout", Math.abs(scaled.w / scaled.ow - 1.5) < 0.08);
  await sp.getByRole("radio", { name: "2×" }).click(); await sp.waitForTimeout(400);
  check("demo scale radio sets 2×", await ov.getAttribute("data-demo-scale") === "2");
  await sp.close();
}

// Badges zoomed (4x) + triangle across styles × backdrops
{ const bp = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 4 })).newPage();
  await bp.goto(`${URL}?scene=states&rm=1`); await bp.mouse.move(5, 660); await bp.waitForTimeout(800);
  const ob = await bp.locator("[data-overlay]").boundingBox();
  await bp.screenshot({ path: "screens/badges-centered-zoom.png", clip: { x: ob.x, y: ob.y, width: ob.width, height: ob.height + 6 } });
  const nb = await bp.locator('[data-badge="needs"]').boundingBox();
  await bp.screenshot({ path: "screens/badge-centered-zoom.png", clip: { x: nb.x - 4, y: nb.y - 4, width: nb.width + 8, height: nb.height + 8 } });
  check("all four badge types render at 16px", (await bp.locator("[data-badge]").count()) === 4 && Math.round(nb.width) === 16);
  await bp.close();
  mkdirSync("screens/_tri", { recursive: true }); const triBoxes = {};
  const tp = await (await browser.newContext({ viewport: lvp, deviceScaleFactor: 2 })).newPage();
  for (const tri of ["violet", "black"]) for (const bd of ["Gradient", "Busy UI", "Light"]) for (const id of labIds) {
    await tp.goto(`${LAB}?style=${id}&still=1&tri=${tri}`); await tp.evaluate(() => { localStorage.clear(); localStorage.setItem("agent-presence.lab.desktopSafe", "0"); }); await tp.reload(); await tp.mouse.move(5, 940);
    await tp.getByRole("radio", { name: bd }).click(); await tp.waitForTimeout(700);
    const o = await tp.locator("[data-overlay]").boundingBox();
    const name = `${tri}-${id}-${bd.split(" ")[0].toLowerCase()}`;
    await tp.screenshot({ path: `screens/_tri/${name}.png`, clip: o });
    triBoxes[name] = {}; for (const sh of ["blob", "square", "drop", "tri"]) { const b = await tp.locator(`[data-overlay] svg[data-shape="${sh}"]`).first().boundingBox(); triBoxes[name][sh] = { x: b.x - o.x, y: b.y - o.y, w: b.width, h: b.height }; }
  }
  writeFileSync("screens/_tri/boxes.json", JSON.stringify(triBoxes));
  { const zp = await (await browser.newContext({ viewport: lvp, deviceScaleFactor: 4 })).newPage();
    await zp.goto(`${LAB}?style=frosted&still=1`); await zp.mouse.move(5, 940); await zp.waitForTimeout(700);
    const o = await zp.locator("[data-overlay]").boundingBox(); await zp.screenshot({ path: "screens/bots-stroke-zoom.png", clip: o });
    check("bots use independent Figma morphology shadows with exact CSS-pixel values", await zp.locator('[data-overlay] svg[data-shape]').evaluateAll(svgs => svgs.length === 4 && svgs.every(svg => {
      const u=32 / +svg.getAttribute('width'), f=svg.querySelector('[data-figma-shadow]');
      const nums=(sel,attr)=>[...f.querySelectorAll(sel)].map(e=>+e.getAttribute(attr)/u);
      const same=(a,b)=>a.length===b.length && a.every((v,i)=>Math.abs(v-b[i])<.001);
      return getComputedStyle(svg.querySelector('[data-bot-body]')).stroke==='none' && f.getAttribute('filterUnits')==='userSpaceOnUse' && same(nums('feMorphology','radius'),[2,1]) && same(nums('feGaussianBlur','stdDeviation'),[8,4]) && same(nums('feOffset','dy'),[8,4]) && [...f.querySelectorAll('feFlood')].map(e=>e.getAttribute('flood-opacity')).join(',')==='0.24,0.20';
    })));
    check("bot shadows are not clipped by ancestors", await zp.locator('[data-overlay] [data-bot-body]').evaluateAll(gs => gs.every(g => { let e = g.parentElement; while (e && !e.matches('main')) { const s = getComputedStyle(e); if (['hidden','clip'].includes(s.overflowX) || ['hidden','clip'].includes(s.overflowY)) return false; e = e.parentElement; } return true; })));
    check("eyes are unfiltered and unstroked", await zp.locator('[data-overlay] svg[data-shape] > g:last-child').evaluateAll(gs => gs.every(g => getComputedStyle(g).stroke === 'none' && getComputedStyle(g).filter === 'none')));
    await zp.close(); }
  await tp.close(); }

// Shape shadows and tonal badges: 4× close-up of all badges plus Busy/Light desktop-safe grid sources.
{ const ctx = await browser.newContext({ viewport: lvp, deviceScaleFactor: 4 });
  const sp = await ctx.newPage();
  await sp.goto(`${URL}?scene=states&rm=1`); await sp.mouse.move(5,940); await sp.waitForTimeout(500);
  const ob = await sp.locator('[data-overlay]').boundingBox();
  await sp.screenshot({path:'screens/shadow-bots-zoom-v2.png',clip:{x:ob.x-30,y:ob.y-30,width:ob.width+60,height:ob.height+90}});
  await sp.screenshot({path:'screens/badges-tonal-zoom.png',clip:{x:ob.x-30,y:ob.y-30,width:ob.width+60,height:ob.height+90}});
  const badgeContrast = await sp.locator('[data-badge-body]').evaluateAll(cs => {
    const lum = h => {const v=h.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
    return cs.map(c=>{const a=lum(c.getAttribute('fill')),b=lum(c.getAttribute('stroke'));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  });
  check("all four tonal badge icons exceed 3:1", badgeContrast.length === 4 && badgeContrast.every(v=>v>=3));
  console.log('Tonal badge contrast:', badgeContrast.map(v=>v.toFixed(2)).join(', '));
  check("badges keep centered 16px geometry and tonal outer rings", await sp.locator('[data-badge-body]').evaluateAll(cs => cs.length === 4 && cs.every(c => c.getAttribute('r') === '8' && c.getAttribute('stroke-width') === '3' && c.getAttribute('paint-order') === 'stroke fill')));
  check("badges have no dark box-shadow ring", await sp.locator('[data-badge]').evaluateAll(es => es.every(e => getComputedStyle(e).boxShadow === 'none')));
  mkdirSync('screens/_shadow_v2', {recursive:true});
  for (const bd of ['Busy UI','Light']) for (const id of ['frosted','dark','iridescent','aurora']) {
    await sp.goto(`${LAB}?style=${id}&still=1&rm=1`); await sp.getByRole('radio',{name:bd,exact:true}).click();
    await sp.getByRole('button',{name:'Needs you',exact:true}).click(); await sp.mouse.move(5,940); await sp.waitForTimeout(500);
    const o = await sp.locator('[data-overlay]').boundingBox();
    await sp.screenshot({path:`screens/_shadow_v2/${id}-${bd === 'Light' ? 'light' : 'busy'}.png`,clip:{x:o.x-30,y:o.y-30,width:o.width+60,height:o.height+90}});
  }
  // Reference comparison: same 432px canvas, #555, silhouette approximations traced from supplied JPEG.
  const fmarkup = await sp.locator('[data-overlay] [data-figma-shadow]').first().evaluate(f => {
    const clone=f.cloneNode(true), u=32 / +f.closest('svg').getAttribute('width');
    clone.id='reference-shadow'; clone.setAttribute('x','-64');clone.setAttribute('y','-64');clone.setAttribute('width','560');clone.setAttribute('height','560');
    for(const [sel,attr] of [['feMorphology','radius'],['feGaussianBlur','stdDeviation'],['feOffset','dy']])
      clone.querySelectorAll(sel).forEach(e=>e.setAttribute(attr,String(+e.getAttribute(attr)/u)));
    return clone.outerHTML;
  });
  const refPath='/home/box/agent-data/agents/32df2b2d-dd91-47c5-b63b-890491587d72/attachments/5096bb68d5391698a9a89f7959cb0f2710e615ee6dd2a5f0374f18b70554d1d1.jpg';
  if (existsSync(refPath)) {
    const refImage=(await import('node:fs')).readFileSync(refPath).toString('base64');
    const cp=await (await browser.newContext({viewport:{width:904,height:500},deviceScaleFactor:1})).newPage();
    await cp.setContent(`<body style="margin:0;background:#101828;color:white;font:15px system-ui"><div style="display:flex;gap:16px;padding:12px"><section><p>Jacob's Figma reference</p><img width="432" height="432" src="data:image/jpeg;base64,${refImage}"></section><section><p>SVG filter · exact specs, traced silhouettes</p><svg width="432" height="432" viewBox="0 0 432 432" style="background:#555555"><defs>${fmarkup}</defs><g filter="url(#reference-shadow)"><circle cx="141" cy="169" r="60" fill="#ff279f"/><path d="M259 303 C259 266 284 235 317 235 C352 235 379 266 379 303 C379 333 365 344 319 344 C275 344 259 333 259 303Z" fill="#777777"/></g><g fill="black"><ellipse cx="102" cy="169" rx="8" ry="18"/><ellipse cx="125" cy="170" rx="8" ry="18"/><ellipse cx="326" cy="287" rx="8" ry="18"/><ellipse cx="350" cy="287" rx="8" ry="18"/></g></svg></section></div></body>`);
    await cp.screenshot({path:'screens/shadow-vs-figma.png'});await cp.close();
  }
  await ctx.close(); }

// Minimal hover behaviour and luminance-balanced Aurora, including the native route preview.
{ const hc = await browser.newContext({viewport:lvp,deviceScaleFactor:2}); const hp=await hc.newPage();
  await hp.goto(`${LAB}?style=aurora&still=1&rm=1`);await hp.mouse.move(5,940);await hp.waitForTimeout(600);
  const glow=hp.locator('[data-aurora]');const before=await glow.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el.firstElementChild).opacity}));
  const weights=await hp.locator('[data-aurora-blob]').evaluateAll(es=>es.map(e=>({color:e.getAttribute('data-color'),weight:+e.getAttribute('data-weight')})));
  writeFileSync('screens/aurora-weights.json',JSON.stringify(weights,null,2));
  check('Aurora white least visible; red reduced; cool hues retained', weights[1].weight === .4 && weights[0].weight < weights[2].weight && weights[0].weight < weights[3].weight && weights[2].weight >= 1 && weights[3].weight >= 1);
  await hp.screenshot({path:'screens/aurora-balanced-after.png'});
  await hp.locator('[data-aurora-blob]').evaluateAll(es=>es.forEach(e=>{e.style.transition='none';e.style.opacity='1';}));
  await hp.screenshot({path:'screens/aurora-balanced-before.png'});
  await hp.locator('[data-aurora-blob]').evaluateAll(es=>es.forEach(e=>e.style.opacity=e.getAttribute('data-weight')));
  const o=await hp.locator('[data-overlay]').boundingBox();await hp.mouse.move(o.x+15,o.y+o.height/2);await hp.waitForTimeout(500);
  const after=await glow.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el.firstElementChild).opacity}));
  check('hover preserves Aurora tint and global opacity',JSON.stringify(before)===JSON.stringify(after));
  await hp.locator('#f-aurora-tintByActive').click();await hp.waitForTimeout(700);
  check('tintByActive uses the same perceptual color weighting',await hp.locator('[data-aurora-blob]').evaluateAll(es=>es.every(e=>e.getAttribute('data-weight')===es[0].getAttribute('data-weight'))));
  const intensity=hp.locator('#f-aurora-intensity');await intensity.fill('0.5');await intensity.dispatchEvent('input');await hp.waitForTimeout(500);
  check('global intensity remains a multiplier', await hp.locator('[data-aurora] > div').evaluate(e=>Math.abs(+getComputedStyle(e).opacity-.4)<.01));
  await hp.goto(`http://localhost:${PORT}/desktop/`);await hp.waitForTimeout(800);const pill=hp.locator('[data-desktop-pill]');
  check('desktop has no drag handle',await hp.locator('.desktop-handle').count()===0);
  const d=await pill.boundingBox();await hp.mouse.move(d.x+30,d.y+30);await hp.waitForTimeout(400);
  check('desktop pill and bot cursors are default',await hp.locator('[data-desktop-pill], [data-desktop-pill] [data-agent]').evaluateAll(es=>es.every(e=>getComputedStyle(e).cursor==='default')));
  await hp.mouse.down();await hp.mouse.move(d.x+50,d.y+40,{steps:5});
  check('desktop cursor becomes grabbing during drag',await pill.evaluate(e=>getComputedStyle(e).cursor==='grabbing'));
  check('desktop document root cursor is grabbing during drag',await hp.evaluate(()=>document.documentElement.style.cursor==='grabbing'));await hp.mouse.up();await hp.waitForTimeout(100);
  check('desktop document root resets after drag release',await hp.evaluate(()=>document.documentElement.style.cursor!=='grabbing'));
  await hc.close(); }

// Restored per-bot hover: fixed layout footprints, highlight + transform only.
{ const cc=await browser.newContext({viewport:lvp,deviceScaleFactor:3});const pp=await cc.newPage();
  await pp.goto(`${LAB}?style=dark&still=1&scale=1.5`);await pp.mouse.move(5,940);await pp.waitForTimeout(700);
  const ov=pp.locator('[data-overlay]');const bots=pp.locator('[data-overlay] [data-agent]');
  const layout=()=>pp.locator('[data-overlay], [data-overlay] [data-agent]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
  const rest=await layout();const r=await ov.boundingBox();
  await pp.screenshot({path:'screens/bot-hover-rest.png',clip:{x:r.x-16,y:r.y-16,width:r.width+32,height:r.height+50}});
  const first=bots.first();const botBox=await first.boundingBox();await pp.mouse.move(botBox.x+botBox.width/2,botBox.y+botBox.height/2);await pp.waitForTimeout(250);
  const hovered=await layout();check('hover does not move or resize pill or any bot container',rest.every((row,i)=>row.every((v,j)=>Math.abs(v-hovered[i][j])<.1)));
  check('bot hover highlight restored',await first.evaluate(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'));
  check('bot hover lift is transform-only',await first.locator('[data-bot-hover]').evaluate(e=>getComputedStyle(e).transform!=='none' || getComputedStyle(e).translate!=='none' || getComputedStyle(e).scale!=='none'));
  await pp.screenshot({path:'screens/bot-hover-active.png',clip:{x:r.x-16,y:r.y-16,width:r.width+32,height:r.height+50}});
  await pp.mouse.down();await pp.mouse.move(botBox.x+botBox.width/2+2,botBox.y+botBox.height/2);await pp.waitForTimeout(50);
  check('short press below threshold keeps default cursor',await ov.evaluate(e=>getComputedStyle(e).cursor==='default'));
  await pp.mouse.move(botBox.x+botBox.width/2+12,botBox.y+botBox.height/2,{steps:3});await pp.waitForTimeout(50);
  check('browser cursor becomes grabbing only after threshold',await ov.evaluate(e=>getComputedStyle(e).cursor==='grabbing'));await pp.mouse.up();await pp.waitForTimeout(100);
  check('browser cursor resets on release',await ov.evaluate(e=>getComputedStyle(e).cursor==='default'));
  await cc.close(); }

// Natural-paced recording sequence, exact color IDs, quiet gaps, no style changes.
{ const dc=await browser.newContext({viewport:lvp});const dp=await dc.newPage();await dp.clock.install();
  await dp.goto(`http://localhost:${PORT}/desktop/`);await dp.keyboard.press('2');await dp.keyboard.press('p');
  await dp.clock.fastForward(100);check('natural demo red Atlas completes first',await dp.locator('[data-agent="atlas"]').getAttribute('data-status')==='done');
  await dp.clock.fastForward(3000);check('natural demo first calm hold is all idle',await dp.locator('[data-agent][data-status="idle"]').count()===4);
  await dp.clock.fastForward(6300);check('natural demo blue Moss needs attention',await dp.locator('[data-agent="moss"]').getAttribute('data-status')==='needs');
  await dp.clock.fastForward(5900);check('natural demo blue returns idle after detail interval',await dp.locator('[data-agent="moss"]').getAttribute('data-status')==='idle');
  await dp.clock.fastForward(2000);check('natural demo white Juniper completes',await dp.locator('[data-agent="juniper"]').getAttribute('data-status')==='done');
  await dp.clock.fastForward(2300);check('natural demo violet Wren completes',await dp.locator('[data-agent="wren"]').getAttribute('data-status')==='done');
  await dp.clock.fastForward(4000);check('natural demo ends calmly with all four idle',await dp.locator('[data-agent][data-status="idle"]').count()===4);
  check('natural demo preserves Dark style',await dp.locator('[data-desktop-style]').getAttribute('data-desktop-style')==='dark');await dc.close(); }

writeFileSync("screens/a11y-report.json", JSON.stringify(report, null, 2));
await browser.close(); killSrv();
const axeTotal = Object.values(report.axe).reduce((n, v) => n + v.length, 0);
console.log(`axe total violations: ${axeTotal}`);
process.exit(report.checks.every(c => c.ok) && axeTotal === 0 ? 0 : 1);
