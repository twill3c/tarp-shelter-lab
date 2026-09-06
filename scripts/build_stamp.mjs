/**
 * ビルドの刻印(HC-148)。
 *
 * 本番検品は「本番が健やかか」しか答えない。デプロイが失敗しても本番は健やかなままなので、
 * 健やかさの項目をいくら増やしても**反映されたか**は分からない —— むしろ「全部緑」という
 * 強い誤った安心が出るぶん危険が増す。
 *
 * そこで、画面が読むデータから刻印を作って配信物に置く。ビルドは手元でも Vercel でも
 * 同じ木から走るので同じ刻印になる。検品はこれを先に引いて手元と突き合わせ、
 * **違えば他を一切見ずに止める**。
 *
 * 材料は「画面が読むデータ」だけにする。ここが変われば画面の中身が変わり、
 * 変わらなければ画面は同じだからである。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 画面がビルド時に import しているデータ */
export const STAMPED = ["data/shelters.json"];

/**
 * 改行を LF に揃えてから測る。
 *
 * この機は `core.autocrlf=true` なので、作業ツリーは CRLF・git と配信側は LF になる。
 * 生のバイト列で測ると**同じ内容でも手元と本番が必ず食い違い**、検査が毎回「違う」と言い続ける。
 * 狼少年になった検査は、無視する癖がつくぶん何もしない検査より悪い。
 */
function normalizeEol(buf) {
  return Buffer.from(buf.toString("utf8").split("\r\n").join("\n"), "utf8");
}

export function computeStamp(root = ROOT) {
  const h = createHash("sha256");
  const files = [];
  for (const rel of STAMPED) {
    const buf = normalizeEol(readFileSync(join(root, rel)));
    files.push({ path: rel, bytes: buf.length, sha: createHash("sha256").update(buf).digest("hex").slice(0, 12) });
    h.update(rel).update("\0").update(buf).update("\0");
  }
  return { stamp: h.digest("hex").slice(0, 16), files };
}

function main() {
  const dir = join(ROOT, "public");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const doc = computeStamp();
  writeFileSync(join(dir, "build-stamp.json"), JSON.stringify(doc, null, 1) + "\n");
  console.log(`刻印 ${doc.stamp}(${doc.files.length} ファイル)→ public/build-stamp.json`);
}

if (process.argv[1] && process.argv[1].endsWith("build_stamp.mjs")) main();
