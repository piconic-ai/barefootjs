# PR レビュー指示（Pullfrog 用）

このファイルは Pullfrog のレビュー実行が読む、リポジトリ管理のレビュー指示。
コンソール側の Review instructions にはこのファイルへのポインタ1行だけを置く。

## 前提

`CLAUDE.md`（`AGENTS.md` として symlink）はコーディングガイドではなく、この
コードベースの設計契約である。レビュー前に読み、diff をその基準に照らして判定
すること。指摘時に規約を再説明しないこと — 該当セクション名を挙げるにとどめる。

## 設計適合（must-address）

diff を CLAUDE.md「Code Conventions」の4つの **Never** 規約と突き合わせる。
どれも実際の regression から生まれた規約であり、動くコードでも違反は
must-address として扱う。指摘には、違反した規約名と、規約が指定する正規の
代替（IR metadata / AST walk、structured IR + 単一レンダラ、lowering-plugin
registry、`BindingScope`）を添える。

## カバレッジ結合（must-address）

コンパイラの受理範囲を広げる PR は、同じ PR に
`packages/adapter-tests/fixtures/` の conformance fixture を最低1つ含む
（`spec/subset-conformance.md` の change-time coupling rule）。既知の4半身
（`ParsedExpr` kind、array-method、builtin lowering plugin、sort-comparator
形式）はすべて exhaustiveness pin + coverage-ledger floor で機械化済み
（#2742）なので、fixture の**有無**は CI が落とす。レビューの仕事は2つ:

1. **fixture が意味を持つか。** 床は存在しか検査しない。拡張の本質的な形を
   突いているか、adversarial なケース（空値・マークアップ・マルチバイト等）
   を data points に足す余地はないか。
2. **どのレジストリも想定しない新種の拡張カテゴリ**が現れたら、最初の PR に
   レジストリ＋床の同梱を must-address として要求する。前例: レビューのみの
   時代に queryHref は fixture ゼロで出荷され、最初の床が #2741 を即座に
   暴いた。

## テストの置き場所

CLAUDE.md のテスト表に照らして、層違いのテストを指摘する。典型:
static のみの attribute / class / ARIA 変更への E2E テスト追加（明示的な
アンチパターン）、event→setter 配線を component IR テスト以外で検証、
テンプレート HTML 出力を adapter conformance fixture 以外で検証。

## 優先度

このコンパイラの最重要の欠陥クラスは **silent divergence** — エラーなしに
契約と異なる出力を出すこと（SSR/CSR 不一致、拒否せず黙って内容を落とす
emitter）。所見の重み付けはこれに従う: silent divergence の恐れは、どんな
スタイル上の懸念よりも優先する。再現可能な divergence を見つけたら、prose の
報告ではなく「known-limitation issue + 正しい出力を主張する pinned fixture +
壊れている側の pin」の三点セットで残す形を提案する（CLAUDE.md「A reproducible
defect lands as a fixture」）。

## 出力

レビューは英語で書く。
