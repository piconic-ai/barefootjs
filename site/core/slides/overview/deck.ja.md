---
lang: ja
aspect_ratio: 16:9
---

<!-- {"key":"cover","layout":"cover"} -->
# BarefootJS

signal ベースの TSX を、いつものテンプレートにコンパイルする。

---

<!-- {"key":"why-backend","layout":"belief"} -->
# 好きなバックエンドを、*手放さない*。

うまく動いているバックエンドは、モダンなコンポーネントモデルの対価ではありません。Go、Rails、Django、Perl、PHP、Rust。そのままで、コンポーネントだけを足す。

---

<!-- {"key":"why-web","layout":"split"} -->
# Web は、とっくに*知っていた*。

- **印を付ける**。変わるノードに。
- **待つ**。イベントを。
- **書く**。新しい値を DOM に。

良いモデルでした。ただ、配線はすべて手作業だった。

```html
<div id="counter">
  <p id="value">0</p>
  <button id="inc">+1</button>
</div>
<script>
let count = 0
$('#inc').on('click', () => {
  count++
  $('#value').text(count)
})
</script>
```

---

<!-- {"key":"why-agents","layout":"belief"} -->
# エージェントに要るのは暗記ではなく、*自分で実行できるチェック*。

実装はいちばん速い工程になり、検証が新しいボトルネックになった。エージェントはどんなツールでも `--help` から学べる。ひとりでは判断できないのは、「動く」と「動いたように見える」の違いだけ。

::: {slot=footnotes}

"Without a check it can run, 'looks done' is the only signal available." — Claude Code docs, *Best practices* · "AI has made the step that was previously the slowest and most expensive — implementation — the fastest." — Cloudflare, *The Agent Development Lifecycle*

:::

---

<!-- {"key":"how-wire","layout":"wire"} -->
# 宣言する。配線は*コンパイラ*に。

書くのは `onClick` と `{count()}` だけ。マーカーも、セレクタも、リスナーも、生成される。

::: {slot=code-left}

```tsx
'use client'
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(n => n + 1)}>
        +1
      </button>
    </div>
  )
}
```

:::

::: {slot=code-right}

```html
<div bf-s="Counter_0">
  <p bf="s1"><!--bf:s0-->0<!--/--></p>
  <button bf="s2">+1</button>
</div>
```

:::

::: {slot=code-right-2}

```js
const [count, setCount] = createSignal(0)
const [_s2] = $(__scope, 's2')
createEffect(() => write('s0', count()))
_s2.addEventListener('click',
  () => setCount(n => n + 1))
```

:::

---

<!-- {"key":"how-compile","layout":"compiler"} -->
# 実行しない。*コンパイルする*。

フレームワークではなく、コンパイラ。TSX と型はビルド時にだけ存在する。実行時にあるのは、いつものテンプレートエンジンと約 16 kB のスクリプトだけ。言語をタップ。

---

<!-- {"key":"how-update","layout":"trace"} -->
# 変わったものだけが、*変わる*。

どのノードがどの signal に依存するかを、コンパイラは知っている。クリック 1 回で書き換わるのはテキストノード 1 つ。ほかには触れない。

---

<!-- {"key":"how-server","layout":"split"} -->
# サーバーが先。JS は*必要なところだけ*。

`"use client"` を付けたコンポーネントだけが JavaScript を持つ。

見出しも、本文も、画像も、テンプレートが出すただの HTML。JS はゼロ。

```tsx
// ProductPage.tsx — server component
import { AddToCart } from './AddToCart'    // "use client"
import { ReviewStars } from './ReviewStars' // "use client"

export function ProductPage({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <img src={product.image} />
      <ReviewStars rating={product.rating} />
      <AddToCart productId={product.id} />
    </div>
  )
}
```

---

<!-- {"key":"how-verify","layout":"terminal"} -->
# 人にも、*エージェントにも*検証できる。

- IR テストは構造をミリ秒で検証する。ブラウザは不要
- `bf` のすべてのコマンドが `--json` を話す
- signal グラフ、トレース、ドキュメント。すべて CLI から

---

<!-- {"key":"what-ships","layout":"ships"} -->
# *届く*もの。

- **1** コンパイラ
- **%%COMPAT_ADAPTERS%%** アダプタ、IR は 1 つ
- **~16 kB** hydration ランタイム
- **%%COMPAT_COMPONENTS%%** コンポーネント
- **1** CLI: `bf`
- **1** エージェント用スキル

---

<!-- {"key":"what-components","layout":"showcase"} -->
# %%COMPAT_COMPONENTS%% のコンポーネント。*shadcn/ui* に倣って。

signal で作り直した。ここにあるカードはすべて本物で、動く。

---

<!-- {"key":"what-arcade","layout":"arcade"} -->
# 弾の一発一発が、*DOM ノード*。

スプライト 1 つが要素 1 つ。コンパイラが生成した effect 1 本がそれを動かす。差分計算はしない。

---

<!-- {"key":"what-start","layout":"command"} -->
# *コマンド*ひとつ。

```sh
npm create barefootjs@latest
```

アルファ版。API は変わりえます。

---

<!-- {"key":"close","layout":"end"} -->
# barefootjs.dev

github.com/piconic-ai/barefootjs
