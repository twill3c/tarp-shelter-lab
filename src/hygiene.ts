// 字種検査(G-08・HC-072)。共通の harness/text_hygiene.py は data/ を見ないので、
// 画面に出す和文を持つ data/shelters.json はこちらで見る。
// 範囲は符号位置の数値で書く —— ソースにエスケープや当の文字を書くと、
// ツール層がエスケープを実体に展開して制御文字がソースに紛れる(loop_000 で実測)。
const FORBIDDEN_RANGES: [number, number, string][] = [
  [0x0400, 0x04ff, "cyrillic"],
  [0x0500, 0x052f, "cyrillic-supplement"],
  [0x1100, 0x11ff, "hangul-jamo"],
  [0x3130, 0x318f, "hangul-compat"],
  [0xac00, 0xd7af, "hangul-syllables"],
  [0x0000, 0x0008, "control"],
  [0x000b, 0x000c, "control"],
  [0x000e, 0x001f, "control"],
  [0x007f, 0x009f, "control"],
];

export interface ForeignChar {
  index: number;
  char: string;
  codePoint: number;
  kind: string;
}

export function findForeignChars(text: string): ForeignChar[] {
  const hits: ForeignChar[] = [];
  let index = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    for (const [lo, hi, kind] of FORBIDDEN_RANGES) {
      if (cp >= lo && cp <= hi) {
        hits.push({ index, char: ch, codePoint: cp, kind });
        break;
      }
    }
    index += ch.length;
  }
  return hits;
}
