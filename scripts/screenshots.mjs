// Reproducible README screenshots. Run `npm run dev` in another terminal, then `npm run screenshots`.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const base = process.env.BASE || "http://127.0.0.1:5177/";
const out = process.env.OUT || "docs";
const browser = await chromium.launch();
const errors = [];
async function shot(name, url, { device, viewport = { width: 1400, height: 1000 }, full = false, clip, before } = {}) {
  const ctx = await browser.newContext(device ? { ...devices[device] } : { viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.waitForSelector("#hb h3");
  await page.waitForTimeout(500);
  if (before) await before(page);
  const target = clip ? page.locator(clip) : page;
  await target.screenshot({ path: `${out}/${name}.png`, fullPage: full && !clip });
  await ctx.close();
}
await shot("overview", "?q=" + encodeURIComponent("How many days of annual leave do I get?"), { viewport: { width: 1400, height: 950 }, before: async (p) => { await p.click("a.jump >> nth=0"); await p.waitForTimeout(1500); } });
await shot("dont-know", "?q=" + encodeURIComponent("Can I bring my dog to the office?"), { viewport: { width: 900, height: 800 }, clip: "#result" });
await shot("accuracy", "", { viewport: { width: 1400, height: 1000 }, clip: "#accuracy" });
await shot("trick-it", "", { viewport: { width: 1400, height: 1000 }, clip: "#trick" });
await shot("mobile", "?q=" + encodeURIComponent("Do I need a doctor's note if I'm sick for two days?"), { device: "iPhone 13", before: async (p) => { await p.evaluate(() => document.querySelector(".card").scrollIntoView()); await p.waitForTimeout(800); } });
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("no console errors");
