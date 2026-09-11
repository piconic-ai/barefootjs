---
lang: en
aspect_ratio: 16:9
---

<!-- {"key":"cover","layout":"cover"} -->
# BarefootJS

Signal-based TSX, compiled into the templates you already ship.

---

<!-- {"key":"write","layout":"live"} -->
# Write TSX.


```tsx
const [count, setCount] = createSignal(0)

<button onClick={() => setCount(count() + 1)}>
  {count()}
</button>
```

---

<!-- {"key":"compile","layout":"compiler"} -->
# One source. Seven languages.


The same `Counter.tsx`, built by every adapter. Tap a language.

---

<!-- {"key":"update","layout":"trace"} -->
# Only what changed, changes.


The compiler knows which node depends on which signal. A click writes one text node. Nothing else is touched.

---

<!-- {"key":"ship","layout":"command"} -->
# One command.


```sh
npm create barefootjs@latest
```

Alpha. APIs may change.

---

<!-- {"key":"play","layout":"game"} -->
# It's just components.


← → move · ↑ rotate · ↓ soft drop · Space hard drop

---

<!-- {"key":"build","layout":"live-todos"} -->
# Day to day.


```tsx
{todos().map(todo => (
  <li key={todo.id}>
    <input type="checkbox" checked={todo.done}
           onChange={() => toggle(todo.id)} />
    {todo.text}
  </li>
))}
```

---

<!-- {"key":"agents","layout":"terminal"} -->
# Built for agents, too.


- IR tests verify structure in milliseconds, no browser
- Every `bf` command speaks `--json`
- Signal graphs, traces, docs: all from the CLI

---

<!-- {"key":"close","layout":"end"} -->
# barefootjs.dev

github.com/piconic-ai/barefootjs
