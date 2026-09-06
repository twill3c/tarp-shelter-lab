// 目視で見つけた「左パネルの文字が枠の外に出ている」が実体か撮影の産物かを測る。
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const srv = createServer((req, res) => {
  let p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (p.endsWith("\\") || p.endsWith("/")) p += "index.html";
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });
await page.goto(base, { waitUntil: "networkidle" });
const m = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
  };
  const aside = document.querySelector("aside.shelters");
  const usage = document.querySelector('#source [data-field="usage"]');
  const ab = aside.getBoundingClientRect();
  const ub = usage.getBoundingClientRect();
  return {
    aside: r("aside.shelters"),
    simulator: r("section.simulator"),
    usage: r('#source [data-field="usage"]'),
    usageOverflowsAside: ub.bottom > ab.bottom + 1,
    asideScroll: { h: aside.scrollHeight, ch: aside.clientHeight },
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: join(root, "logs", "shots", "tall-viewport.png") });
await browser.close();
srv.close();
