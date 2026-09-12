---
lang: en
aspect_ratio: 16:9
---

<!-- {"key":"cover","layout":"cover"} -->
# BarefootJS

Signal-based TSX, compiled into the templates you already ship.

---

<!-- {"key":"why-backend","layout":"belief"} -->
# Keep the backend you *love*.

A backend that serves you well shouldn't be the price of a modern component model. Go, Rails, Django, Perl, PHP, Rust: keep them. Add the components.

---

<!-- {"key":"why-web","layout":"split"} -->
# The web already *knew* how.

- **Mark** the nodes that will change.
- **Listen** for the event.
- **Write** the new value into the DOM.

A good model. Every wire tied by hand.

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
# Agents don't need to know it by heart. They need a *check they can run*.

Implementation has become the fastest step; verification is the new bottleneck. An agent can learn any tool from `--help`. What it can't do alone is tell "works" from "looks done".

::: {slot=footnotes}

"Without a check it can run, 'looks done' is the only signal available." — Claude Code docs, *Best practices* · "AI has made the step that was previously the slowest and most expensive — implementation — the fastest." — Cloudflare, *The Agent Development Lifecycle*

:::

---

<!-- {"key":"how-wire","layout":"wire"} -->
# Declare it. Let the compiler *wire* it.

`onClick` and `{count()}` are all you write. The markers, the selectors, the listeners: emitted.

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
# Compile, *don't run*.

It's a compiler, not a framework. TSX and types exist at build time. At runtime: your template engine and one ~16 kB script. Tap a language.

---

<!-- {"key":"how-update","layout":"trace"} -->
# Only what changed, *changes*.

The compiler knows which node depends on which signal. A click writes one text node. Nothing else is touched.

---

<!-- {"key":"how-server","layout":"split"} -->
# Server first. JS only *where you say so*.

`"use client"` marks the components that need interactivity. Only those ship JavaScript.

The heading, the copy, the image: plain HTML from your template, zero JS.

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
# Verifiable by humans *and agents*.

- IR tests verify structure in milliseconds, no browser
- Every `bf` command speaks `--json`
- Signal graphs, traces, docs: all from the CLI

---

<!-- {"key":"what-ships","layout":"ships"} -->
# What *ships*.

- **1** compiler
- **%%COMPAT_ADAPTERS%%** adapters, one IR
- **~16 kB** hydration runtime
- **%%COMPAT_COMPONENTS%%** components
- **1** CLI: `bf`
- **1** agent skill

---

<!-- {"key":"what-components","layout":"showcase"} -->
# %%COMPAT_COMPONENTS%% components, designed after *shadcn/ui*.

Rebuilt on signals. Every card here is live.

---

<!-- {"key":"what-arcade","layout":"arcade"} -->
# Every bullet is a *DOM node*.

Each sprite is one element; one compiler-generated effect moves it. No diffing.

---

<!-- {"key":"what-start","layout":"command"} -->
# One *command*.

```sh
npm create barefootjs@latest
```

Alpha. APIs may change.

---

<!-- {"key":"close","layout":"end"} -->
# barefootjs.dev

github.com/piconic-ai/barefootjs
