// ベストスコアの保存(F-09・G-06)。storage は注入する(テストは DOM 無しで走る — N-04)。
// localStorage は private モード・サイトデータ遮断で getItem 自体が投げるので、全部 try で包む。
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BestRecord {
  score: number;
  rank: string;
  seconds: number;
  mistakes: number;
  at: string;
}

const PREFIX = "tarp-shelter-lab:best:";

function isRecord(v: unknown): v is BestRecord {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["score"] === "number" &&
    Number.isFinite(o["score"]) &&
    typeof o["rank"] === "string" &&
    typeof o["seconds"] === "number" &&
    typeof o["mistakes"] === "number" &&
    typeof o["at"] === "string"
  );
}

export function loadBest(storage: StorageLike, shelterId: string): BestRecord | null {
  try {
    const raw = storage.getItem(PREFIX + shelterId);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** より高いスコアのときだけ置き換える。返り値は保持された記録 */
export function saveBest(storage: StorageLike, shelterId: string, rec: BestRecord): BestRecord {
  const current = loadBest(storage, shelterId);
  const keep = current !== null && current.score >= rec.score ? current : rec;
  if (keep === rec) {
    try {
      storage.setItem(PREFIX + shelterId, JSON.stringify(rec));
    } catch {
      // 保存できなくても画面は続ける(記録は今回限りになる)
    }
  }
  return keep;
}
