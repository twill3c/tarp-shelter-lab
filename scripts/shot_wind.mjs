// 風の見た目を目視で確かめるための撮影(HC-041: 目で見なければ分からない性質は手順で残す)。
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");
const shots = join(root, "logs", "shots");
mkdirSync(shots, { recursive: true });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = createServer((req, res) => {
  let p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (p.endsWith("\\") || p.endsWith("/")) p += "index.html";
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404).end("nf");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(base, { waitUntil: "networkidle" });

for (const [id, dir, speed] of [
  ["a-frame", "90", "80"],
  ["a-frame", "0", "80"],
  ["lean-to", "180", "70"],
  ["lean-to", "0", "70"],
]) {
  await page.click(`#shelter-list button[data-shelter="${id}"]`);
  await page.click("#btn-auto");
  await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("SHELTER COMPLETE"), null, { timeout: 40000 });
  await page.locator("#wind-speed").fill(speed);
  await page.locator("#wind-speed").dispatchEvent("input");
  await page.locator("#wind-dir").selectOption(dir);
  await page.waitForTimeout(400);
  const v = (await page.locator("#wind-verdict").innerText()).trim();
  const n = (await page.locator("#wind-value").innerText()).trim();
  const why = (await page.locator("#wind-reason").innerText()).trim();
  console.log(`${id} 風向 ${dir} 風速 ${speed}% → ${v} ${n}(${why})`);
  await page.locator("section.simulator").screenshot({ path: join(shots, `wind-${id}-${dir}.png`) });
}
await browser.close();
srv.close();
