# TARP & SHELTER LAB

米軍サバイバル・マニュアル(FM 3-05.70、旧 FM 21-76)に載るタープ設営を、
ブラウザの中で「見る → 動かす → 張る → 試す → 理解する」順に体験する教材アプリ。
外部 API・DB・認証を使わず、静的配信だけで動く。

## 状態(2026-09-07)

| ループ | 内容 | 状態 |
|---|---|---|
| L0 | 足場・SPEC・データ三種(A-Frame / Lean-To / Diamond)・判定/張力/完成/スコア/保存の純粋ロジックとテスト | 完了 |
| L1 | SVG シミュレータ UI・ドラッグ・AUTO・HINT・フッタ・出典表示・ビルド・実ブラウザ検品 | 完了 |
| L2 | Vercel 公開・app-menu 掲載・ビルド刻印つき本番検品 | 完了 |

デモ URL: https://tarp-shelter-lab.vercel.app

## 遊び方

1. 左の SHELTERS から張り方を選ぶ(最初は A-FRAME)。
2. 畳んであるタープをタップして広げる。
3. トレイの POLE を点線の印へドラッグして立てる。全部立つとタープが持ち上がる。
4. PEG を点線の印へドラッグして打つ。印から離れすぎると打ち直し(ミス +1)。
5. 光っているタープの端からペグへ線を引いてロープを結ぶ。
6. たるんだロープは、ペグをつまんで外へ引く。
7. すべて張れると SHELTER COMPLETE。時間・ミス・ヒントからスコアとランクが出る。

HINT は次の目標を光らせる(減点あり)。AUTO は正しい手順を再生する(記録は残さない)。
マウスとタッチのどちらでも同じ操作で動く。

## 何が決まっているか

- 設営モデル(cm 単位の平面図・張力の式・完成の六条件・スコア式)は `SPEC.md` §4
- シェルター定義は `data/shelters.json`。張り終えた形の寸法は三平方で導いている
- 出典と権利は `docs/SOURCES.md` / `docs/LICENSES.md`。原図は転載しない

## 開発

```bash
npm install
npm run dev            # 開発サーバ
npm run build          # 出荷ビルド(tsc --noEmit → vite build → dist/)
npm run verify         # 型検査 → 単体テスト → ゲート対応検査 → ビルド → 実ブラウザ検品
npm run check:browser  # 実ブラウザ検品だけ(dist/ が要る)
npm run deploy         # Vercel 本番へ
npm run check:prod -- --url https://tarp-shelter-lab.vercel.app/   # 本番検品
```

`npm run verify` は五つを順に通す。実ブラウザ検品は `dist/` を手元の静的サーバから配り、
Playwright(chromium)で実際にドラッグして完成させ、図の幾何・二つの画面幅・フッタ規約・
外部読込の不在まで測る。スクリーンショットは `logs/shots/` に残る。

本番検品は別物で、**配られているものが手元と同じか**を先に見る。ビルド時に
配信物を決める入力(`index.html` / `src` / `styles` / `data`)から刻印を作って
`build-stamp.json` に置き、検品はまずそれを引いて突き合わせる。違えば他を一切見ずに止める。
本番が健やかかと、本番が新しいかは別の問いだからである。

ループの記録は `logs/loops/*.jsonl`(`python harness/looplog.py summary --loop loop_000`)。

## 免責

本アプリは教育・シミュレーション目的であり、実際の野外活動の安全性を保証しない。
実際の設営では現地の天候・地形・地盤・用具の仕様・製造者の説明書・現地の規則・
最新の安全情報を優先すること(原案 §31)。

## ライセンス

MIT(`LICENSE`)。参考資料の権利は `docs/LICENSES.md`。
