// 本番検品(TEST_SPEC P-01..P-05)。配られているものを実際に引いて測る。
// **刻印を先に照合し、違えば他を一切見ずに落とす**(HC-148)。
// 終了コード: 合格 0 / 検品の不合格 1 / 検品器自身の異常 2。
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { computeStamp } from "./build_stamp.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const shotDir = join(root, "logs", "shots");
mkdirSync(shotDir, { recursive: true });

const i = process.argv.indexOf("--url");
const urlArg = i >= 0 ? process.argv[i + 1] : undefined;
// 引数が無いときは throw しない —— ESM のトップレベルの例外は終了コードを 1 に固定し、
// 「検品器自身の異常 = 2」を上書きしてしまう(loop_002 で実測)
const base = urlArg ? new URL(urlArg.endsWith("/") ? urlArg : urlArg + "/") : null;

// 各ケースが確かめる品質ゲート(SPEC §6)。check_gates.mjs がこの対応を数える(HC-157)
const GATES = { "P-01": "G-14", "P-02": "G-15", "P-03": "G-15", "P-04": "G-15", "P-05": "G-15" };

const results = [];
function report(id, ok, detail) {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} [${GATES[id] ?? "-"}] ${detail}`);
}

async function main() {
  // P-01: 配られているものが手元と同じか。ここが違えば以降の合否は「この本番」について何も語らない
  const want = computeStamp(root);
  let got = null;
  let why = "";
  try {
    const res = await fetch(new URL("build-stamp.json", base));
    if (!res.ok) why = `HTTP ${res.status}`;
    else got = await res.json();
  } catch (e) {
    why = String(e);
  }
  if (!got) {
    console.error(`FAIL P-01 [G-14] 本番の刻印を読めない(${why})`);
    console.error("  → 刻印より前のビルドが配られている。検品は打ち切る");
    process.exitCode = 1;
    return;
  }
  if (got.stamp !== want.stamp) {
    console.error("FAIL P-01 [G-14] **本番は手元と違うものを配っている**");
    console.error(`  手元 ${want.stamp} / 本番 ${got.stamp}`);
    const byPath = new Map((got.files ?? []).map((f) => [f.path, f]));
    for (const f of want.files) {
      const g = byPath.get(f.path);
      if (!g) console.error(`  - ${f.path}: 本番に無い`);
      else if (g.sha !== f.sha) console.error(`  - ${f.path}: 手元 ${f.bytes}B / 本番 ${g.bytes}B`);
    }
    console.error("  → デプロイが済んでいない。検品の合否はこの本番については語れない");
    process.exitCode = 1;
    return;
  }
  report("P-01", true, `刻印 ${want.stamp} — 本番は手元と同じものを配っている`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const foreign = new Set();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.host !== base.host) foreign.add(u.host);
    });
    const res = await page.goto(base.href, { waitUntil: "networkidle" });
    await page.waitForSelector("svg#field", { timeout: 15000 });
    report("P-02", res?.status() === 200 && errors.length === 0, `HTTP ${res?.status()} / エラー ${errors.length} 件 ${errors.slice(0, 2).join(" | ")}`);
    report("P-03", foreign.size === 0, `外部 host ${[...foreign].join(",") || "0 件"}`);

    const footer = await page.evaluate(() => {
      const f = [...document.querySelectorAll("body *")].find(
        (el) => el.innerText?.includes("App Menu") && el.innerText?.includes("MIT License") && el.querySelector("a"),
      );
      if (!f) return null;
      let pos = f;
      while (pos && getComputedStyle(pos).position !== "fixed" && pos !== document.body) pos = pos.parentElement;
      return { text: f.innerText.replace(/\s+/g, " "), links: f.querySelectorAll("a").length, fixed: pos ? getComputedStyle(pos).position === "fixed" : false };
    });
    if (!footer) report("P-04", false, "フッタが見つからない");
    else {
      const iLic = footer.text.indexOf("MIT License");
      const iGh = footer.text.indexOf("GitHub", Math.max(iLic, 0));
      const iMenu = footer.text.lastIndexOf("App Menu");
      report("P-04", footer.links === 5 && iLic >= 0 && iLic < iGh && iGh < iMenu && footer.fixed, `${footer.links} リンク / fixed ${footer.fixed} / "${footer.text}"`);
    }

    // P-05: 配られた JS が実際に動くか。AUTO は状態機械を一周する
    await page.click("#btn-auto");
    let completed = true;
    try {
      await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("SHELTER COMPLETE"), null, { timeout: 40000 });
    } catch {
      completed = false;
    }
    report("P-05", completed, completed ? "AUTO で COMPLETE に到達" : "AUTO が COMPLETE に達しなかった");
    await page.screenshot({ path: join(shotDir, "production.png"), fullPage: false });
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length} 項目 / 失敗 ${failed.length}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

// **process.exit を使わない。** fetch の handle が開いたまま呼ぶと Windows の libuv が
// assertion で abort し、終了コードが 127 になる —— 規約の「不合格 1 / 検品器の異常 2」を
// 自分で壊すうえ、127 は多くの CI で「コマンドが無い」と読まれる(loop_002 で実測)。
if (!base) {
  console.error("使い方: node scripts/prod_check.mjs --url https://<本番>/");
  process.exitCode = 2;
} else {
  main().catch((e) => {
    console.error("検品器が停止:", e);
    process.exitCode = 2;
  });
}
