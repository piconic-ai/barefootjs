# タグつき TODO テーブル — SSR ↔ ハイドレーション監査レポート

- 実施日: 2026-07-25(監査時点の HEAD: `cc36fb7`)
- 対象: `explorations/tagged-todo/TaggedTodoTable.tsx`(本監査用に新規作成)+ Hono アダプタ + `@barefootjs/client` 実ランタイム + 実 Chromium
- 方針: **修正は行わず**、SSR HTML とハイドレーション後 DOM・挙動の食い違いを記録する

## 対象コンポーネントがカバーする形状

| 要件 | 実装箇所 |
|---|---|
| signal による行の追加・削除・並べ替え(keyed loop) | `todos` signal + `key={t.id}` の `.map()`、add / del / up / toggle ボタン |
| filter / sort チェーン | `todos().filter(t => {...hideDone()...}).sort((a,b) => ...sortMode()...)` |
| `.map()` ブロック体(return 前の const・配列組み立て) | `const stateLabel = ...; const cells = []; cells.push(<td>...</td>)` |
| タグ展開の flatMap ブロック体 | `todos().flatMap(t => { if (...) return []; const prefix = ...; return t.tags.map(...) })` |
| 分割代入 props のループ内参照 | `owner`(map の return 要素と flatMap leaf)、`maxTags`(flatMap の条件) |
| 特殊文字データ | タイトル・タグ・props に `<b>`、`&`、`"`、`<script>`、`'` を含む |

## 再現手順(全体)

```sh
bun install
bun run --filter '@barefootjs/client' build   # standalone ランタイムのビルド
bun run explorations/tagged-todo/harness/compile.ts   # コンパイル + 各状態の SSR HTML 生成
bun run explorations/tagged-todo/harness/audit.ts     # シナリオ監査(Chromium)
bun run explorations/tagged-todo/repros/repro-runner.ts  # 最小再現の一括検証(Chromium)
```

`audit.ts` は各操作(add / delete / move-up / toggle-done / hide-done / sort-asc / sort-desc)について、「initial SSR をハイドレートして操作した後の DOM」と「同じ状態を新規に SSR した HTML」を突き合わせ、コンソールエラーと合わせて `out/audit-results.json` に記録する。`repro-runner.ts` は下記の最小再現をそれぞれ独立ページで実行する。サンドボックス環境では `PLAYWRIGHT_CHROMIUM_EXECUTABLE` で Chromium を指定できる(未指定時は `/opt/pw-browsers/chromium`)。

注: 監査ログ中の `favicon.ico` 404 はハーネスのホストページ由来であり、フレームワークとは無関係(検証済み・所見から除外)。

---

## A. バグ候補(優先度順・最小再現つき)

### BUG-1 【Critical】 flatMap 式体 + JSX: 生の JSX がクライアントバンドルへ漏れ、コンポーネント全体が *無警告で* ハイドレーション不能になる

**最小再現**(`repros/cases.ts` の `r1b-flatmap-expression-body`):

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
export function R1b() {
  const [todos, setTodos] = createSignal<{ id: number; tags: string[] }[]>([{ id: 1, tags: ['a', 'b'] }])
  return <ul>{todos().flatMap(t => t.tags.map(tag => <li key={`${t.id}:${tag}`}>{tag}</li>))}</ul>
}
```

**観測結果:**
- コンパイル診断: **0 件**(error も warning もなし)
- 生成 client JS(抜粋)— JSX がテキスト式として素通しされる:
  ```js
  createEffect(() => {
    const __val = todos().flatMap(t => t.tags.map(tag => <li key={`${t.id}:${tag}`}>{tag}</li>))
    __anchor_s0 = __bfText(__anchor_s0, __val)
  })
  ```
- ブラウザ: `pageerror: Unexpected token '<'` — モジュール全体が SyntaxError で読み込めず、**そのコンポーネントの初期化・イベント配線がすべて無効化**される(同一ファイル内の他ボタン等も全滅)
- SSR(Hono)は正常に描画されるため、**目視では壊れて見えない**。操作して初めて全操作が無反応と判明する

**深刻な理由:** サイレント(sound-or-loud 不変条件の破れ)。`CLAUDE.md` が root-cure 済みとする「raw JSX in the client bundle」漏れそのものが、flatMap の *式体*(ブロック体でない形)で再発している。`map-body-no-silent-divergence.test.ts` は `.map()` 体のみを検査しており flatMap 式体は網から漏れている模様。なお `docs/core/rendering/jsx-compatibility.md` は `.flatMap()` を Hono で「works」と記載している(→ DOC-1)。

---

### BUG-2 【Critical】 flatMap ブロック体: ハイドレーションだけで DOM の項目が消失し(表示破壊)、項目追加は `cloneNode(null)` でクラッシュ、以後もリストは一切反応しない

**最小再現**(`r1a-flatmap-block-body`):

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; tags: string[] }
export function R1a() {
  const [todos, setTodos] = createSignal<Item[]>([{ id: 1, tags: ['a', 'b'] }, { id: 2, tags: ['c', 'd'] }])
  const add = () => setTodos([...todos(), { id: 9, tags: ['x'] }])
  return (
    <div>
      <button id="add" onClick={add}>add</button>
      <ul id="list">{todos().flatMap(t => {
        if (t.tags.length > 5) return []
        return t.tags.map(tag => <li key={`${t.id}:${tag}`}>{tag}</li>)
      })}</ul>
    </div>
  )
}
```

**観測結果(操作前後の実 DOM):**

```
SSR             : <ul id="list"><li>a</li><li>b</li><li>c</li><li>d</li></ul>
ハイドレート直後 : <ul id="list"><li data-key="0">a</li><li data-key="1">b</li></ul>   ← c, d が消える
#add クリック    : 変化なし + pageerror: Cannot read properties of null (reading 'cloneNode')
```

**原因(生成コード、`out/client.js` の l1 に相当):**

```js
mapArray(() => todos(), _s0, null, (t, __idx, __existing) => {
  if (t().tags.length > 5) return [];;
  if (__existing) return __existing;
  const __tpl = document.createElement('template');
  __tpl.innerHTML = ``;                                    // ← leaf HTML が空文字列
  return __tpl.content.firstElementChild.cloneNode(true)   // ← firstElementChild は null
}, 'l1')
```

クライアント側の flatMap ループ配線が壊れている点は 4 つ:
1. **ソースが平坦化前の `todos()`** — SSR は「タグ数ぶん」の `<li>` を出すのに、クライアントは「todo 数」で reconcile する(SSR 4 件 → todo 2 件に切り詰め)
2. **keyFn が `null`** — ソースの `key={`${t.id}:${tag}`}` は無視され index キー(`data-key="0","1",...`)になる
3. **レンダラの template が空文字列** — 新規項目の生成は必ず `cloneNode(null)` で例外
4. **leaf の effect 配線が皆無** — 既存 DOM は `__existing` をそのまま返すだけで、タグ変更・`[done]` prefix 変更など一切追従しない

本体監査(`audit.ts`)では全 8 シナリオでこのリストが「SSR 4 件 vs ハイドレート後 3 件」の恒常的な食い違いを出す(`out/audit-results.json` 参照)。**ユーザー操作なしで SSR コンテンツが破壊される**点が最重度。なお `packages/jsx/src/__tests__/flatmap-segments.test.ts` のヘッダは flatMap の SSR/CSR 非対称を「data-key・コメントマーカーの構造差」として要調査扱いにしているが、実害はその記述を大きく超える(DOM 欠落・クラッシュ・非リアクティブ)。

---

### BUG-3 【High】 keyed `.map()` ブロック体(配列組み立て preamble)+ 行内イベントハンドラ: 全行アクションが `t is not a function` で死ぬ

**最小再現**(`r2a-map-preamble-onclick`。`r2b` は preamble なしの対照で、正常動作):

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; name: string }
export function R2a() {
  const [items, setItems] = createSignal<Item[]>([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])
  const del = (id: number) => setItems(items().filter(i => i.id !== id))
  return <ul id="list">{items().map(t => {
    const cells = []
    cells.push(<span>{t.name}</span>)
    return <li key={t.id}>{cells}<button className="del" onClick={() => del(t.id)}>del</button></li>
  })}</ul>
}
```

**観測結果:** del クリック → `pageerror: t is not a function`、行は削除されない。preamble を外した対照(`r2b`)では正常に削除される。本体監査では delete / move-up / toggle-done の 3 操作すべてがこれで無反応だった。

**原因(生成された委譲ハンドラ、抜粋):**

```js
const t = items().find(item => String(item.id) === key)   // ← t はプレーンオブジェクト
const cells = []; cells.push(`<span><!--bf:s1-->${escapeText(t().name)}<!--/--></span>`);
                                                 // ↑ mapArray renderItem 文脈のゲッター形 t() のまま splice
if (t) (() => del(t.id))(__bfEvt)
```

preamble 文が委譲イベントハンドラへもスプライスされる際、renderItem 文脈(`t` がゲッター)向けの `t()` 書き換えが混入し、ハンドラ文脈(`t` はプレーンオブジェクト)と不整合を起こす。さらにこの spliced preamble はハンドラ内で一切使われないデッドコードでもある(`cells` は未参照)。

---

### BUG-4 【Low・潜在】 委譲ハンドラ内で preamble の `const` が `if (t)` ガードより前に評価される

`r2c-map-const-preamble-onclick`(const のみの preamble)は現状動作するが、生成ハンドラは:

```js
const t = items().find(item => String(item.id) === key)
const label = t.done ? 'done' : 'open';   // ← ガード前に t を参照
if (t) (() => del(t.id))(__bfEvt)
```

`find()` が外れるケース(クリックと再描画の競合等で `data-key` が現行リストに存在しない場合)には `if (t)` に到達する前に TypeError となる。BUG-3 と同根(preamble のハンドラへの splice)であり、修正時に同時に消える可能性が高い。

---

### 検証して「問題なし」を確認できた点(ノイズ除去のため明記)

- **keyed 行ループ(`<tr>`)の追加・filter・sort の reconcile**: add 後の行、hide-done、sort-asc/desc の行順・キー・セル内容はすべて新規 SSR と一致
- **エスケープ整合**: `<b>`・`&`・`"`・`'`・`<script>` を含むタイトル/タグ/props は、SSR(Hono)とクライアント再描画(`escapeText`/`escapeAttr`)でテキスト・属性とも一致。`bf-p` JSON 経由の特殊文字 round-trip も破損なし
- **`"` を含む key**(`r3-string-key-quotes`): クライアント追加行の `data-key` は setAttribute 経路で安全にセットされ、属性破損なし(当初疑ったが**再現せず**)
- **分割代入 props のループ内参照**(`owner` / `maxTags`): d67bf5c 修正後の形は SSR・ハイドレートとも正しく解決
- **signal を読む filter 述語・sort 比較関数**: `hideDone()` / `sortMode()` の変更に行ループが正しく追従

---

## B. ドキュメント摩擦(優先度順)

### DOC-1 【High】 `rendering/jsx-compatibility` の Limitations 表は `.flatMap()` を Hono で「works」と記載しているが、クライアント側は全滅する

表(`.reduce()`, `.forEach()`, `.flatMap()` → 「works (runs as JS)」)は **SSR の話しかしていない**が、その但し書きがない。実際は BUG-1(式体: バンドル自体が壊れる)/ BUG-2(ブロック体: ハイドレーションで DOM 欠落)であり、「works」を信じて `"use client"` コンポーネントで使うと表示破壊に直行する。少なくとも「JS-runtime アダプタで works = SSR が実行できるという意味であり、クライアント反映(ハイドレーション後の更新)の保証ではない」ことの明記が必要。

### DOC-2 【High】 `.map()` ブロック体(preamble)の対応境界がドキュメントに存在しない

List Rendering の節はシンプルな `.map()` と filter/sort チェーンのみで、監査中に踏んだ以下の境界は **BF021 のエラーメッセージにしか現れない**:
- preamble で組み立てる JSX 要素にはイベントハンドラ・コンポーネント・ネストしたループ・リアクティブ式(分割代入 prop 参照を含む)を置けない(例: `cells.push(<td>{owner}</td>)` は BF021、`return` 側の要素に置けば OK)
- flatMap ブロック体は組み立てた配列の裸 `return`(`const out = []; ...; return out`)不可。`return xs.map(...)` 形のみ
- 同じ prop 参照でも flatMap leaf(`return t.tags.map(tag => <li>{owner}...`)は許容という非対称

エラー自体は loud で文言も良いが、「書く前に知る」場所がない。

### DOC-3 【Medium】 「BF021 は非 JS テンプレートアダプタでのみ発生」という記述が map/flatMap 体の BF021 と矛盾して読める

`jsx-compatibility` の脚注は「An off-subset filter predicate or sort comparator … is raised as BF021 **only on non-JS template adapters** — a JS-runtime adapter (Hono, CSR) executes the callback body verbatim」と一般化した書き方だが、DOC-2 の preamble/flatMap 形状の BF021 は **Hono でも fire する**(リアクティブ配線の都合でありアダプタ非依存 — 挙動としては正しい)。predicate/comparator 限定である旨を明確化しないと、「Hono なら通るはず」という誤読を誘う(本監査でも最初にそう誤読した)。

### DOC-4 【Medium】 bf CLI が規約パス外のコンポーネントを扱えず、「新規ディレクトリで作る」ワークフローで CLI ファーストの開発規約が成立しない

`CLAUDE.md` / agent skill は「まず `bf docs` / `bf debug graph`」を必須とするが、CLI は `ui/components/ui/<name>/index.tsx` 等の規約パスでしか解決できない(`bf debug graph TaggedTodoTable` → "Cannot find component"、ファイルパス指定オプションなし)。本監査のような新規ディレクトリ・スパイク開発では `bf debug graph` / `bf gen test` が一切使えない。任意 `.tsx` パスを受ける `--file` 相当があると、規約と実態が一致する。

### DOC-5 【Low】 flatMap の SSR/CSR 非対称に関する既知情報が実害を過小に見せる

`flatmap-segments.test.ts` ヘッダの「leaf `data-key` はクライアントのみ・エスケープなし、スロットコメントマーカーはクライアントのみ」という記述は、実挙動(BUG-2: ハイドレーションでの DOM 欠落・クラッシュ・完全非リアクティブ)より大幅に軽い。known-limitation issue に BUG-1/BUG-2 の実 DOM 影響(「操作ゼロで SSR コンテンツが消える」)を反映すべき。なお同ヘッダ言及の「hydrate テンプレート側 leaf `data-key` の未エスケープ補間」(`data-key="${`${t.id}:${tag}`}"` — 隣の `data-tag` は `escapeAttr` 済み)は生成コード上で現存を確認したが、flatMap クライアント描画自体が壊れているため実 DOM では未発現。

---

## 付録: 生成物

| ファイル | 内容 |
|---|---|
| `out/audit-results.json` | シナリオ別の抽出状態・diff・コンソールエラー(再生成可) |
| `out/repro-results.json` | 最小再現の before/after DOM とエラー(再生成可) |
| `out/ssr-*.html` / `out/dom-*.html` | 各状態の SSR HTML / ハイドレート後 DOM ダンプ(再生成可) |
| `repros/cases.ts` | 最小再現 6 件(バグ 4 + 対照 1 + 反証済み 1) |

`out/` は再生成可能なため git 管理外(`.gitignore`)。
