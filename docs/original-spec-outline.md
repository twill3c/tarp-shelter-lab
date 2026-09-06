# 原案(仕様書 v1.0・2026-09-06)の節構成と本 SPEC の対応

原案「TARP & SHELTER LAB — 米国政府・米軍サバイバル・マニュアルを参考にした
インタラクティブ・タープ設営シミュレーター仕様書 v1.0」は利用者から添付で届き、
ディスクに実体が無い。原案の本文をこのリポジトリへ置く場合は
`docs/tarp_shelter_lab_specification.md` に置く(未配置)。

| 原案 | 内容 | 本 SPEC での扱い |
|---|---|---|
| §1–§3 | 概要・コンセプト・想定ユーザー | §1 目的 |
| §4 | 四機能(SHELTER 図鑑 / SIMULATOR / MISSION / ROPE WORK) | F-01・F-02 は MVP、MISSION・ROPE WORK は F-18(Phase 3–4) |
| §5 | MVP 範囲(三種・SVG・ドラッグ・ステップ・判定・完成・リセット・AUTO・localStorage) | F-01〜F-10 |
| §6 | メイン画面(左に選択・中央にシミュレータ・下にステップ) | L1 の画面構成 |
| §7 | 設営操作と A-Frame の例・フィードバック文言 | §4.2–§4.5、文言は `src/judge.ts` / `src/simulator.ts` |
| §8 | アニメーション(展開・ポール・ロープ・張力・完成・風・雨) | 展開〜完成は L1、風・雨は F-17 |
| §9 | 簡易物理(ropeLength / tension / たるみ / ポール / ペグ / 風) | §4.3–§4.4 に値の入った規則として定めた |
| §10–§11 | 風・雨 | F-17(Phase 2) |
| §12 | 図鑑 10 種の一覧 | 三種のみデータ化。残りは Phase 2–3 |
| §13–§14 | MISSION・スコア・クイズ | スコア式は §4.6 に採用、MISSION・クイズは F-18 |
| §15 | ロープワーク | F-18(Phase 4) |
| §16–§17 | 参考資料表示・ライセンス方針・LICENSES.md の項目 | F-13、`docs/LICENSES.md` |
| §18–§19 | 技術構成(HTML/CSS/TS・SVG・JSON・localStorage・Go Functions・Vercel) | 採用。ビルドは Vite。Go は §7 で保留 |
| §20 | Go API(/api/challenge, /api/shelter, /api/health) | F-16(保留: この機に Go が無い) |
| §21 | データ仕様(`shelters.json`) | §5。部品数の属性は持たず配列長から導く |
| §22 | ディレクトリ構成 | 概ね踏襲(`styles/` `data/` `docs/` `scripts/`)。`api/` は置かない |
| §23–§24 | UI・レスポンシブ | N-02、L1 |
| §25–§26 | 保存・無料運用方針 | F-09、N-03 |
| §27 | 開発フェーズ | §8 ループ計画 |
| §28 | 受入条件 | L1 の完了条件に写す(Go 停止時の動作は「置かない」ので自明) |
| §29 | テスト仕様 | TEST_SPEC.md |
| §30–§31 | README・免責 | README、画面の免責 |
| §32 | 参考資料(FM 21-76・GovInfo・Wikimedia Commons・Vercel Docs) | `docs/SOURCES.md` |
| §33–§36 | 開発原則・完成イメージ・将来拡張・最優先項目 | §1(A-Frame 一種類を先に完成させる) |
