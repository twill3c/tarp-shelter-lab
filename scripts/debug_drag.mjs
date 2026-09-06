// B-03 の切り分け用。各操作の後で DOM の状態を出す。
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = createServer((req, res) => {
  let p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (p.endsWith("\\") || p.endsWith("/")) p += "index.html";
  const file = join(dist, p);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
await page.goto(base, { waitUntil: "networkidle" });

const dump = async (tag) => {
  const d = await page.evaluate(() => ({
    step: document.querySelector("#steps li.active")?.dataset.step,
    tarp: document.querySelector("path#tarp")?.getAttribute("data-state"),
    targets: document.querySelectorAll("circle.target").length,
    poles: document.querySelectorAll("g.pole").length,
    pegs: document.querySelectorAll("g.peg").length,
    ropes: document.querySelectorAll("line.rope").length,
    anchors: document.querySelectorAll("circle.anchor").length,
    feedback: document.querySelector("#feedback")?.textContent,
    status: document.querySelector("#status")?.textContent,
  }));
  console.log(tag, JSON.stringify(d));
};
await dump("初期     ");
await page.click("path#tarp");
await page.waitForTimeout(900);
await dump("展開後   ");

async function center(sel) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  if (!b) throw new Error("no box " + sel);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function drag(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const shelters = JSON.parse(readFileSync(join(root, "data", "shelters.json"), "utf8")).shelters;
const a = shelters[0];
for (const p of a.poles) {
  const from = await center('#tray button[data-part="pole"]');
  const to = await center(`circle.target[data-kind="pole"][data-id="${p.id}"]`);
  console.log(`pole ${p.id}: from`, from, "to", to);
  await drag(from, to);
  await page.waitForTimeout(300);
  await dump(`ポール${p.id} `);
}
await page.waitForTimeout(900);
await dump("張り上げ後");
for (const g of a.pegs) {
  const to = await center(`circle.target[data-kind="peg"][data-id="${g.id}"]`).catch((e) => null);
  if (!to) {
    console.log(`peg ${g.id}: 目標が無い`);
    continue;
  }
  await drag(await center('#tray button[data-part="peg"]'), to);
  await page.waitForTimeout(150);
}
await dump("ペグ後   ");
for (const r of a.ropes) {
  const from = await center(`circle.anchor[data-rope="${r.id}"]`).catch(() => null);
  if (!from) {
    console.log(`rope ${r.id}: anchor が無い`);
    continue;
  }
  await drag(from, await center(`g.peg[data-id="${r.peg}"]`));
  await page.waitForTimeout(150);
  await dump(`ロープ${r.id} `);
}
await page.screenshot({ path: join(root, "logs", "shots", "debug.png"), fullPage: true });
await browser.close();
srv.close();
