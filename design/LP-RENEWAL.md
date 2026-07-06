# BarefootJS LP リニューアル ハンズオン(Claude Code 用)

barefootjs.dev のLPを、確定済みのポジショニングに沿ってリニューアルするための作業手順書。
モックHTML(`barefootjs-lp-v3.html`)を正として実サイトに反映する。

## 0. 前提と素材

- リポジトリ: `piconic-ai/barefootjs`(LPの実装場所は Phase 1 で調査)
- モック: `barefootjs-lp-v3.html` をリポジトリの `design/lp-mock/` に配置しておく
- このファイル自体も `design/LP-RENEWAL.md` として配置し、Claude Code に読ませる

## 決定事項(Claude Code が守るべき文脈)

1. ポジション: BarefootJS は「UIコンポーネントコンパイラ」。フレームワークではない。
2. H1: `TSX in. Your stack out.`("Your stack" をアクセント色)。
   説明的コピー `Components without the Node server.` は title タグ / meta description 用。
3. ページ構成は5ブロックのみ: Hero+入出力デモ → 二択の解消(Two good answers. Now a third.)→
   CI検証マトリクス → for / not for → `npm create barefoot@latest`。
   機能ツアー型のセクション(パイプライン図解・価値カード・アコーディオンFAQ)は追加しない。
4. 敵を作らない文体: Alpine / Stimulus / Next.js / Remix には必ず先に長所を述べる。
   「compromise」「untestable」「big price」等の断定的・攻撃的表現は禁止。
5. 表記統一: 表示名は `BarefootJS`。`BareFootJS` / `Barefoot.js` / `BarefootJs` は誤り。
   npmパッケージ名 `barefootjs` とロゴタイプ(小文字 `barefootjs`)はそのまま。
6. デモの出力コードは実物: モック内の右パネル(go / rails / django / perl)は
   プレースホルダなので、実際の `bf compile` の出力に差し替える。手書き風の嘘は不可。
7. HN文化への配慮: 自動巡回・カルーセル・装飾アニメーション禁止。タブは手動のみ。
   マトリクスは静的表示。「Star on GitHub」ではなく「Source on GitHub」。

## Phase 1: 現状調査

Claude Code へのプロンプト:

```
design/LP-RENEWAL.md と design/lp-mock/barefootjs-lp-v3.html を読んでください。
その上で、現在のLP(barefootjs.dev のトップページ)の実装を調査し、
以下を報告してください。まだコードは変更しないでください。

1. LPのソースファイルの場所とレンダリング方式(SSR / 静的 / 使用フレームワーク)
2. 既存のデザイントークン・CSSの管理方法
3. title / meta / OGP の定義場所
4. ドキュメント全体での BareFootJS / Barefoot.js の表記揺れの出現箇所一覧(件数付き)
5. モックを反映する際の実装方針の提案(既存構造を活かすか、作り直すか)
```

報告を確認してから Phase 2 へ。方針が妥当なら「その方針で進めて」と返す。

## Phase 2: モックの反映

```
Phase 1 の方針で、design/lp-mock/barefootjs-lp-v3.html を正として
LPを実装してください。守ること:

- セクション構成・コピー(英文)・リンク先はモックに完全に従う
- ナビとフッターの Components リンクは https://ui.barefootjs.dev
- ヒーローCTAは「Get started」「Browse 62 components」の2つのみ
- LP自体がBarefootJSでビルドされている場合は dogfooding を維持する
- レスポンシブ(760px以下で1カラム)、focus-visible、prefers-reduced-motion 対応
```

## Phase 3: デモ出力の実物化

```
LPの入出力デモの右パネル4つ(go / rails / django / perl)を、
モック内のプレースホルダから実際のコンパイル出力に差し替えてください。

1. 左パネルの Counter.tsx を実際に bf compile で4アダプタ向けにコンパイルする
2. 出力をそのまま(整形は最小限、嘘の簡略化はしない)右パネルに反映する
3. 出力が長すぎて見せられない場合は、その旨と実際の行数を報告して指示を待つ
```

出力が冗長すぎた場合の判断はこちらで行う(省略記法を入れるか、Counterより小さい例に変えるか)。

## Phase 4: 表記統一と Vale ルール

```
1. リポジトリ全体(docs / README / package.json の description / サイト内文言)で
   表示名を BarefootJS に統一してください。ただし以下は除外:
   - npmパッケージ名・import文・URL・コード識別子の barefootjs(小文字)
   - ロゴタイプの小文字表記
2. Vale に表記ルールを追加してください:

   styles/Barefoot/Naming.yml
   extends: substitution
   message: "Use 'BarefootJS' (npm package: barefootjs)"
   level: error
   swap:
     'BareFootJS': BarefootJS
     'Barefoot\.js': BarefootJS
     'BarefootJs': BarefootJS

3. CI のドキュメントチェックにこのルールが乗っていることを確認してください。
```

## Phase 5: 検証

```
以下を確認して結果を報告してください:

1. ビルドが通ること(既存のCIコマンドで)
2. LP内の全リンクが有効であること(内部ルーティング・ui.barefootjs.dev・GitHub)
3. title が「BarefootJS — TSX in. Your stack out.」、
   meta description が「Components without the Node server.」で始まること
4. モバイル幅(375px)でデモパネルが縦積みになること
5. Vale が旧表記を検出してエラーになること(意図的に BareFootJS と書いて確認後、戻す)
```

## Phase 6: コミットと PR

```
変更をコミットして PR を作成してください。ルール:

- コミットは Phase 単位で分割する(反映 / デモ実物化 / 表記統一 / Vale)
- 各コミットメッセージの最終行に必ず次を入れる:
  Co-Authored-By: kfly8 <kentafly88@gmail.com>
- PR のタイトルと本文は英語で書く(OSSのため)
- PR 本文には以下を含める:
  - Before / After のスクリーンショット
  - ポジショニング変更の要約(1段落。design/LP-RENEWAL.md への参照)
  - デモ出力が実際の bf compile 出力であることの明記
```

## 受け入れ条件チェックリスト

- [ ] H1 が `TSX in. Your stack out.` で、直下に入出力デモがある
- [ ] 「Two good answers. Now a third.」セクションで既存2手法が敬意をもって記述されている
- [ ] マトリクスセクションのセルが実データ(62×8)と一致し、静的表示である
- [ ] for / not for セクションに「向かない場合」が3項目ある
- [ ] Quickstart が `npm create barefoot@latest` である
- [ ] デモ右パネルが実際の `bf compile` 出力である
- [ ] 自動巡回・装飾アニメーションが存在しない
- [ ] 全体で `BareFootJS` / `Barefoot.js` が0件(Vale がエラーにする)
- [ ] 全コミットに Co-Authored-By 行がある
- [ ] PR が英語である
