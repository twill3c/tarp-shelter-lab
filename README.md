# TARP & SHELTER LAB

米軍サバイバル・マニュアル(FM 3-05.70、旧 FM 21-76)に載るタープ設営を、
ブラウザの中で「見る → 動かす → 張る → 試す → 理解する」順に体験する教材アプリ。
外部 API・DB・認証を使わず、静的配信だけで動く。

## 状態(2026-09-06)

| ループ | 内容 | 状態 |
|---|---|---|
| L0 | 足場・SPEC・データ三種(A-Frame / Lean-To / Diamond)・判定/張力/完成/スコア/保存の純粋ロジックとテスト | 完了 |
| L1 | SVG シミュレータ UI・ドラッグ・AUTO・HINT・フッタ・出典表示・ビルド・実ブラウザ検品 | 未着手 |
| L2 | Vercel 公開・app-menu 掲載 | 未着手 |

デモ URL: 未公開。

## 何が決まっているか

- 設営モデル(cm 単位の平面図・張力の式・完成の六条件・スコア式)は `SPEC.md` §4
- シェルター定義は `data/shelters.json`。張り終えた形の寸法は三平方で導いている
- 出典と権利は `docs/SOURCES.md` / `docs/LICENSES.md`。原図は転載しない

## 開発

```bash
npm install
npm run verify     # tsc --noEmit + vitest + ゲート対応検査
npm run dev        # (L1 以降)開発サーバ
npm run build      # (L1 以降)出荷ビルド
```

ループの記録は `logs/loops/*.jsonl`(`python harness/looplog.py summary --loop loop_000`)。

## 免責

本アプリは教育・シミュレーション目的であり、実際の野外活動の安全性を保証しない。
実際の設営では現地の天候・地形・地盤・用具の仕様・製造者の説明書・現地の規則・
最新の安全情報を優先すること(原案 §31)。

## ライセンス

MIT(`LICENSE`)。参考資料の権利は `docs/LICENSES.md`。
