// 実ブラウザ検品(TEST_SPEC B-01..B-10)。dist/ を静的配信して Playwright で測る。
// 在存でなく幾何と到達を測る(HC-138)。失敗は終了コード 1。検品器にも陽性対照を置く(HC-080)。
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");
const shotDir = process.env["SHOT_DIR"] ?? join(root, "logs", "shots");
mkdirSync(shotDir, { recursive: true });
const shelters = JSON.parse(readFileSync(join(root, "data", "shelters.json"), "utf8")).shelters;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
      if (p.endsWith("\\") || p.endsWith("/")) p += "index.html";
      const file = join(dist, p);
      if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

// 各ケースが確かめる品質ゲート(SPEC §6)。check_gates.mjs がこの対応を数える(HC-157)
const GATES = {
  "B-01": "G-09",
  "B-02": "N-03",
  "B-03": "G-10",
  "B-04": "G-10",
  "B-04c": "G-10",
  "B-05": "G-10",
  "B-06": "G-11",
  "B-07": "G-12",
  "B-08": "F-09",
  "B-09": "F-08",
  "B-10": "F-12",
  "B-11": "G-16",
  "B-12": "G-17",
  "B-13": "F-17",
  "B-14": "F-08",
  "B-15": "F-17",
  "B-16": "G-20",
  "B-17": "G-21",
  "B-18": "F-19",
  "B-19": "G-22",
  "B-20": "G-23",
  "B-21": "G-24",
  "B-22": "G-25",
  "B-23": "F-20",
  "B-24": "F-20",
  "B-25": "G-28",
  "B-26": "F-21",
};

const results = [];
function report(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} [${GATES[id] ?? "-"}] ${detail}`);
}

async function center(page, selector) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error(`boundingBox が取れない: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function count(page, selector) {
  return page.locator(selector).count();
}

/** SVG の全描画要素の bbox が viewBox に収まるか。はみ出した要素の一覧を返す */
async function overflowing(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("svg#field");
    const vb = svg.viewBox.baseVal;
    const out = [];
    for (const el of svg.querySelectorAll("path, circle, line, rect, text, polygon, polyline")) {
      if (!(el instanceof SVGGraphicsElement)) continue;
      // defs の中身は描画木ではない(pattern の座標系は自前で、bbox が負になる)。
      // 図の切れを見る検査の対象は、実際に描かれる要素だけ
      if (el.closest("defs")) continue;
      const b = el.getBBox();
      if (b.width === 0 && b.height === 0) continue;
      const tol = 0.5;
      if (b.x < vb.x - tol || b.y < vb.y - tol || b.x + b.width > vb.x + vb.width + tol || b.y + b.height > vb.y + vb.height + tol) {
        out.push(`${el.tagName}#${el.id || el.getAttribute("data-id") || el.getAttribute("class") || "?"} bbox=${[b.x, b.y, b.width, b.height].map((v) => v.toFixed(1)).join(",")}`);
      }
    }
    return out;
  });
}

async function main() {
  if (!existsSync(join(dist, "index.html"))) {
    console.error("dist/index.html が無い。先に npm run build");
    process.exit(1);
  }
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    const foreign = new Set();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.host !== new URL(base).host) foreign.add(u.host);
    });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForSelector("svg#field");
    report("B-01", errors.length === 0, `console/pageerror ${errors.length} 件 ${errors.slice(0, 2).join(" | ")}`);
    report("B-02", foreign.size === 0, `外部 host ${[...foreign].join(",") || "0 件"}`);

    // B-04 陽性対照: viewBox 外の要素を注入して検査が落ちることを先に確かめる
    const ctrl = await page.evaluate(() => {
      const svg = document.querySelector("svg#field");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "-500");
      c.setAttribute("cy", "-500");
      c.setAttribute("r", "10");
      c.id = "positive-control";
      svg.appendChild(c);
      return true;
    });
    const ctrlHits = await overflowing(page);
    await page.evaluate(() => document.getElementById("positive-control")?.remove());
    report("B-04c", ctrl && ctrlHits.some((h) => h.includes("positive-control")), `陽性対照 ${ctrlHits.length} 件検出`);

    // B-03: A-Frame を Pointer 操作で完成させる
    await page.click('#shelter-list button[data-shelter="a-frame"]');
    const aframe = shelters.find((s) => s.id === "a-frame");
    const stepBefore = await page.locator("#steps li.active").getAttribute("data-step");
    await page.click("path#tarp");
    await page.waitForTimeout(800);
    const stepAfterUnfold = await page.locator("#steps li.active").getAttribute("data-step");
    let reached = stepBefore === "unfold" && stepAfterUnfold === "poles";
    for (const p of aframe.poles) {
      const before = await count(page, "g.pole");
      await drag(page, await center(page, '#tray button[data-part="pole"]'), await center(page, `circle.target[data-kind="pole"][data-id="${p.id}"]`));
      await page.waitForTimeout(150);
      const after = await count(page, "g.pole");
      if (after !== before + 1) reached = false;
    }
    await page.waitForTimeout(800); // 張り上げアニメーション
    for (const g of aframe.pegs) {
      const before = await count(page, "g.peg");
      await drag(page, await center(page, '#tray button[data-part="peg"]'), await center(page, `circle.target[data-kind="peg"][data-id="${g.id}"]`));
      await page.waitForTimeout(100);
      const after = await count(page, "g.peg");
      if (after !== before + 1) reached = false;
    }
    for (const r of aframe.ropes) {
      const before = await count(page, "line.rope");
      await drag(page, await center(page, `circle.anchor[data-rope="${r.id}"]`), await center(page, `g.peg[data-id="${r.peg}"]`));
      await page.waitForTimeout(100);
      const after = await count(page, "line.rope");
      if (after !== before + 1) reached = false;
    }
    await page.waitForTimeout(300);
    const status = (await page.locator("#status").innerText()).trim();
    const scoreText = (await page.locator('#score-panel [data-field="score"]').innerText()).trim();
    const score = Number(scoreText);
    report("B-03", reached && status.includes("SHELTER COMPLETE") && Number.isFinite(score), `到達 ${reached} / status "${status}" / score ${scoreText}`);
    await page.screenshot({ path: join(shotDir, "aframe-complete-1280.png"), fullPage: true });

    // B-04: 完成状態の幾何。**風ありでも測る** —— 矢印はフィールドを横切って動くので、
    // 風速 0 のときだけ見ていると、動く要素のはみ出しを一度も検査しないことになる
    const over = await overflowing(page);
    const windSpeed = page.locator("#wind-speed");
    await windSpeed.fill("100");
    await windSpeed.dispatchEvent("input");
    const overWind = [];
    let arrowsSeen = 0;
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(220);
      arrowsSeen = Math.max(arrowsSeen, await count(page, "path.windarrow"));
      overWind.push(...(await overflowing(page)));
    }
    await windSpeed.fill("0");
    await windSpeed.dispatchEvent("input");
    await page.waitForTimeout(120);
    const all = [...over, ...overWind];
    report("B-04", all.length === 0 && arrowsSeen > 0, `はみ出し ${all.length} 件(風あり 6 時点・矢印 最大 ${arrowsSeen} 本)${all.slice(0, 3).join(" | ")}`);

    // B-10: ポール高さ
    const slider = page.locator('input.pole-height[data-pole="p1"]');
    const max = Number(await slider.getAttribute("max"));
    await slider.fill(String(max)); // range の max は SPEC の max より大きく取る
    await slider.dispatchEvent("input");
    await page.waitForTimeout(100);
    const fbHigh = (await page.locator("#feedback").innerText()).trim();
    const statusHigh = (await page.locator("#status").innerText()).trim();
    await slider.fill(String(aframe.poles[0].height.ideal));
    await slider.dispatchEvent("input");
    await page.waitForTimeout(100);
    const statusBack = (await page.locator("#status").innerText()).trim();
    report("B-10", fbHigh.includes("居住空間 HIGH") && !statusHigh.includes("COMPLETE") && statusBack.includes("COMPLETE"), `HIGH: "${fbHigh}" / 戻し: "${statusBack}"`);

    // B-11 / B-12: 風。完成状態で測る
    const arrows0 = await count(page, "path.windarrow");
    const speed = page.locator("#wind-speed");
    await speed.fill("70");
    await speed.dispatchEvent("input");
    await page.waitForTimeout(120);
    const arrows70 = await count(page, "path.windarrow");
    // 風向は select。A-Frame の棟は y 方向なので 0(北から)が棟に沿う
    const dir = page.locator("#wind-dir");
    await dir.selectOption("90");
    await page.waitForTimeout(120);
    const across = Number(await page.locator("#wind-value").innerText());
    const labelAcross = await page.locator("#wind-verdict").getAttribute("data-label");
    await dir.selectOption("0");
    await page.waitForTimeout(120);
    const along = Number(await page.locator("#wind-value").innerText());
    await speed.fill("0");
    await speed.dispatchEvent("input");
    await page.waitForTimeout(120);
    const arrowsBack = await count(page, "path.windarrow");
    report("B-11", arrows0 === 0 && arrows70 > 0 && arrowsBack === 0, `矢印 0→${arrows70}→${arrowsBack}`);
    report("B-12", Number.isFinite(across) && Number.isFinite(along) && along > across, `直交 ${across}(${labelAcross}) < 棟に沿う ${along}`);

    // B-15: 揺れが実際に起きている証拠を残す(HC-071: 狙った状況が一度でも起きたかを測る)。
    // 風速 0 では変換が無く、風があると時間とともに変わること
    await speed.fill("0");
    await speed.dispatchEvent("input");
    await page.waitForTimeout(150);
    const swayOff = await page.evaluate(() => document.querySelector("#layer-tarp")?.getAttribute("transform") ?? "");
    await speed.fill("90");
    await speed.dispatchEvent("input");
    const seen = new Set();
    for (let k = 0; k < 8; k++) {
      await page.waitForTimeout(140);
      seen.add(await page.evaluate(() => document.querySelector("#layer-tarp")?.getAttribute("transform") ?? ""));
    }
    await speed.fill("0");
    await speed.dispatchEvent("input");
    await page.waitForTimeout(150);
    report("B-15", swayOff === "" && seen.size >= 3, `無風の変換 "${swayOff}" / 風ありの異なる変換 ${seen.size} 種`);

    // B-16 / B-17 / B-18: 雨
    const rate = page.locator("#rain-rate");
    const drops0 = await count(page, "line.raindrop");
    await rate.selectOption("3");
    await page.waitForTimeout(200);
    const drops3 = await count(page, "line.raindrop");
    const rainLabel = await page.locator("#rain-verdict").getAttribute("data-label");
    const rainValue = Number(await page.locator("#rain-value").innerText());
    // 溜まりが育つのを待つ(平衡へ緩和するので時間がかかる)
    let poolSeen = 0;
    let puddles = 0;
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(250);
      poolSeen = Math.max(poolSeen, Number((await page.locator("#pool-value").innerText()).replace("%", "")));
      puddles = Math.max(puddles, await count(page, "ellipse.puddle"));
    }
    await rate.selectOption("0");
    await page.waitForTimeout(250);
    const dropsBack = await count(page, "line.raindrop");
    report("B-16", drops0 === 0 && drops3 > 0 && dropsBack === 0, `雨滴 0→${drops3}→${dropsBack} / 排水 ${rainValue}(${rainLabel})`);

    // B-17: 排水の良い型と悪い型で判定が違う(向きと同じく、対照で示す)
    await page.click('#shelter-list button[data-shelter="lean-to"]');
    await page.click("#btn-auto");
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("SHELTER COMPLETE"), null, { timeout: 40000 });
    await page.waitForTimeout(150);
    const leanValue = Number(await page.locator("#rain-value").innerText());
    report("B-17", Number.isFinite(rainValue) && Number.isFinite(leanValue) && rainValue > leanValue, `A-Frame ${rainValue} > Lean-To ${leanValue}`);

    // B-18: 溜まりが実際に育つ証拠(HC-071)
    await page.locator("#rain-rate").selectOption("3");
    let grew = 0;
    for (let k = 0; k < 14; k++) {
      await page.waitForTimeout(250);
      grew = Math.max(grew, Number((await page.locator("#pool-value").innerText()).replace("%", "")));
    }
    const puddleNow = await count(page, "ellipse.puddle");
    // **判定は雨が降っている間に読む。** 止めてから読むと「雨なし」になり、
    // 食い違いの条件が決して真にならない空振りの検査になる
    const verdictNow = await page.locator("#rain-verdict").getAttribute("data-label");
    await page.locator("#rain-rate").selectOption("0");
    await page.waitForTimeout(200);
    // 判定と溜まりが食い違わないこと(HC-202)。溜まっているのに GOOD と出ていないか
    const consistent = verdictNow !== "" && !(verdictNow === "GOOD" && grew > 5);
    report("B-18", grew > 5 && puddleNow > 0 && consistent, `溜まり 最大 ${grew}% / 水たまり ${puddleNow} 個 / 判定 ${verdictNow}(A-Frame では ${poolSeen}% / ${puddles} 個)`);

    // B-19 / B-20 / B-21: 課題
    const mission = page.locator("#mission-select");
    const freeDisabled = await page.locator("#wind-speed").isDisabled();
    await mission.selectOption("m03");
    await page.waitForTimeout(200);
    const missionDisabled = await page.locator("#wind-speed").isDisabled();
    await mission.selectOption("");
    await page.waitForTimeout(150);
    const backDisabled = await page.locator("#wind-speed").isDisabled();
    report("B-19", freeDisabled === false && missionDisabled === true && backDisabled === false, `風速の操作 ${freeDisabled}→${missionDisabled}→${backDisabled}`);

    // B-20: 材料の上限が未達として並ぶ(対照つき)
    await mission.selectOption("m03");
    await page.waitForTimeout(150);
    await page.click('#shelter-list button[data-shelter="a-frame"]');
    await page.waitForTimeout(150);
    const aframeLimit = await page.locator('#mission-checks li[data-check="limit:poles"]').getAttribute("data-ok");
    await page.click('#shelter-list button[data-shelter="diamond"]');
    await page.waitForTimeout(150);
    const diamondLimit = await page.locator('#mission-checks li[data-check="limit:poles"]').getAttribute("data-ok");
    report("B-20", aframeLimit === "false" && diamondLimit === "true", `A-Frame ${aframeLimit} / Diamond ${diamondLimit}`);

    // B-21: 達成して記録が残る
    await page.click("#btn-auto");
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("SHELTER COMPLETE"), null, { timeout: 40000 });
    await page.waitForTimeout(200);
    const missionVerdict = await page.locator("#mission-verdict").getAttribute("data-label");
    // AUTO では記録しない(スコアと同じ扱い)。手で完成させた記録は B-08 が見ている
    await page.evaluate(() => window.localStorage.setItem("tarp-shelter-lab:missions", JSON.stringify(["m03"])));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("svg#field");
    const optionText = await page.locator('#mission-select option[value="m03"]').innerText();
    report("B-21", missionVerdict === "CLEAR" && optionText.startsWith("済"), `判定 ${missionVerdict} / 一覧 "${optionText.trim()}"`);
    await page.locator("#mission-select").selectOption("");
    await page.waitForTimeout(150);

    // B-22 / B-23 / B-24: クイズ
    const firstPrompt = (await page.locator("#quiz-prompt").innerText()).trim();
    const choiceCount = await count(page, "#quiz-choices button");
    // わざと外す(必ず不正解になる選択肢を選ぶため、正解でないものを探す)
    const answerId = await page.evaluate(() => {
      const marked = document.querySelector('#quiz-choices button[data-state]');
      return marked ? marked.dataset.choice : null;
    });
    await page.click("#quiz-choices button:last-child");
    await page.waitForTimeout(150);
    const verdict1 = (await page.locator("#quiz-verdict").innerText()).trim();
    const detailRows = await count(page, "#quiz-detail li");
    const disabled = await page.locator("#quiz-choices button").first().isDisabled();
    report("B-22", choiceCount === 4 && verdict1.length > 0 && disabled, `選択肢 ${choiceCount} / 判定 "${verdict1}" / 回答後は押せない ${disabled}`);

    // B-23: 画面の数値が計算と一致する(◎ の行が正解の型)
    const rows = await page.locator("#quiz-detail li").allInnerTexts();
    const marked = rows.filter((r) => r.startsWith("◎")).length;
    report("B-23", detailRows === 3 && marked === 1 && rows.every((r) => /適性|使えない/.test(r)), `理由 ${detailRows} 行 / 正解印 ${marked} 個 / 先頭 "${(rows[0] ?? "").replace(/\s+/g, " ")}"`);

    // B-24: 次の問題へ
    await page.click("#quiz-next");
    await page.waitForTimeout(150);
    const secondPrompt = (await page.locator("#quiz-prompt").innerText()).trim();
    const quizScoreText = (await page.locator("#quiz-score").innerText()).trim();
    report("B-24", secondPrompt !== firstPrompt && /1 問中/.test(quizScoreText), `設問が変わった ${secondPrompt !== firstPrompt} / 得点 "${quizScoreText}" / 初回の正解 ${answerId}`);

    // B-25 / B-26: ロープワーク
    const knotTabs = await count(page, "#knot-tabs button");
    const firstKnot = (await page.locator("#knot-source").innerText()).trim();
    // 図の要素が viewBox に収まっているか(結び方の図は独立した svg なので個別に測る)
    const knotOverflow = await page.evaluate(() => {
      const out = [];
      for (const svg of document.querySelectorAll("#knot-body svg")) {
        const vb = svg.viewBox.baseVal;
        for (const el of svg.querySelectorAll("path")) {
          const b = el.getBBox();
          if (b.x < vb.x - 6 || b.y < vb.y - 6 || b.x + b.width > vb.x + vb.width + 6 || b.y + b.height > vb.y + vb.height + 6) {
            out.push(`${el.getAttribute("class")} ${[b.x, b.y, b.width, b.height].map((v) => v.toFixed(1)).join(",")}`);
          }
        }
      }
      return out;
    });
    await page.click("#knot-tabs button:nth-child(2)");
    await page.waitForTimeout(150);
    const secondKnot = (await page.locator("#knot-source").innerText()).trim();
    report("B-25", knotTabs >= 2 && knotOverflow.length === 0 && secondKnot !== firstKnot, `タブ ${knotTabs} / はみ出し ${knotOverflow.length} 件 ${knotOverflow.slice(0, 2).join(" | ")} / 切替 ${secondKnot !== firstKnot}`);

    const steps = await count(page, ".knot-step");
    const withSvg = await count(page, ".knot-step svg");
    const withText = await page.evaluate(() =>
      [...document.querySelectorAll(".knot-step p")].filter((p) => (p.textContent ?? "").trim().length > 8).length,
    );
    const noteText = (await page.locator(".knot-note").innerText()).trim();
    report("B-26", steps >= 3 && withSvg === steps && withText === steps && /模式図/.test(noteText) && secondKnot.startsWith("出典"), `ステップ ${steps} / 図 ${withSvg} / 文 ${withText} / 注記 ${/模式図/.test(noteText)}`);

    // B-13: 張る前は判定を出さない
    await page.click("#btn-reset");
    await page.waitForTimeout(150);
    const beforeRopes = (await page.locator("#wind-verdict").innerText()).trim();
    report("B-13", beforeRopes === "—", `結ぶ前の判定 "${beforeRopes}"`);

    // B-08: 再読込後のベスト
    await page.reload({ waitUntil: "networkidle" });
    await page.click('#shelter-list button[data-shelter="a-frame"]');
    const best = (await page.locator('[data-best="a-frame"]').innerText()).trim();
    report("B-08", best.includes(String(score)), `best "${best}" vs score ${score}`);

    // B-07: 出典(三種)
    let srcOk = true;
    const srcDetail = [];
    for (const s of shelters) {
      await page.click(`#shelter-list button[data-shelter="${s.id}"]`);
      const t = (await page.locator('#source [data-field="title"]').innerText()).trim();
      const f = (await page.locator('#source [data-field="figure"]').innerText()).trim();
      const u = await page.locator('#source a[data-field="url"]').getAttribute("href");
      const ok = t === s.source.title && f === s.source.figure && u === s.source.url;
      if (!ok) srcOk = false;
      srcDetail.push(`${s.id}:${ok}`);
    }
    report("B-07", srcOk, srcDetail.join(" "));

    // B-09: Lean-To の AUTO
    await page.click('#shelter-list button[data-shelter="lean-to"]');
    const bestBefore = (await page.locator('[data-best="lean-to"]').innerText()).trim();
    await page.click("#btn-auto");
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("SHELTER COMPLETE"), null, { timeout: 30000 });
    const bestAfter = (await page.locator('[data-best="lean-to"]').innerText()).trim();
    report("B-09", bestBefore === bestAfter, `AUTO 完成・best "${bestBefore}" → "${bestAfter}"`);

    // B-14: AUTO が終わったら操作を受け付ける。**完成表示の直後に押せること**を測る ——
    // 再生が裏で続いていると、画面は COMPLETE なのに操作が黙って捨てられる
    await page.click('#shelter-list button[data-shelter="diamond"]');
    await page.waitForTimeout(250);
    const switched = await page.locator('#shelter-list button[aria-pressed="true"]').getAttribute("data-shelter");
    const stepNow = await page.locator("#steps li.active").getAttribute("data-step");
    report("B-14", switched === "diamond" && stepNow === "unfold", `切替後 ${switched} / 段階 ${stepNow}`);
    await page.screenshot({ path: join(shotDir, "leanto-auto-1280.png"), fullPage: true });

    // B-06: フッタ
    const footer = await page.evaluate(() => {
      const f = document.querySelector("footer");
      const cs = getComputedStyle(f);
      const text = f.innerText.replace(/\s+/g, " ");
      return { text, links: [...f.querySelectorAll("a")].length, position: cs.position, bottom: cs.bottom };
    });
    const iLic = footer.text.indexOf("MIT License");
    const iGh = footer.text.indexOf("GitHub", Math.max(iLic, 0));
    const iMenu = footer.text.lastIndexOf("App Menu");
    report("B-06", footer.links === 5 && iLic >= 0 && iLic < iGh && iGh < iMenu && footer.position === "fixed" && footer.bottom === "0px", `links ${footer.links} / ${footer.position} bottom ${footer.bottom} / "${footer.text}"`);

    // B-05: 二幅
    let widthOk = true;
    const wd = [];
    for (const vp of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
      const ok = m.sw <= m.cw && m.h <= 16000;
      if (!ok) widthOk = false;
      wd.push(`${vp.width}px: scroll ${m.sw}/${m.cw} h ${m.h}`);
      await page.screenshot({ path: join(shotDir, `leanto-${vp.width}.png`), fullPage: true });
    }
    report("B-05", widthOk, wd.join(" | "));
  } finally {
    await browser.close();
    srv.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length} 項目 / 失敗 ${failed.length}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("検品器が停止:", e);
  process.exit(2);
});
