// SPEC.md のゲート表 G-xx と tests/ の対応を機械で数える(HC-157)。
// 各 G-xx は (a) tests/ のどれかのファイルから ID で参照される、または
// (b) SPEC の当該行に「未実装」と明記される、のいずれかでなければならない。
// どちらでもないゲートがあれば終了コード 1。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const spec = readFileSync(join(root, "SPEC.md"), "utf8");

const gateLines = spec.split("\n").filter((l) => /^\|\s*G-\d{2}\s*\|/.test(l));
if (gateLines.length === 0) {
  console.error("SPEC.md にゲート表が無い(走査対象が空)");
  process.exit(1);
}

const testDir = join(root, "tests");
const testText = readdirSync(testDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(testDir, f), "utf8"))
  .join("\n");

let bad = 0;
for (const line of gateLines) {
  const id = line.match(/G-\d{2}/)[0];
  const referenced = new RegExp(`\\b${id}\\b`).test(testText);
  const declaredUnimplemented = line.includes("未実装");
  const status = referenced ? "tested" : declaredUnimplemented ? "unimplemented" : "ORPHAN";
  if (status === "ORPHAN") bad++;
  console.log(`${id}\t${status}`);
}
console.log(`gates ${gateLines.length} / orphan ${bad}`);
process.exit(bad === 0 ? 0 : 1);
