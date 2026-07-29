---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Keep a live DOM node intact when it lands on a lazy loop row's content slot

A child-position interpolation can evaluate to a real element rather than a
string:

```tsx
{_p.renderCell(row.id)}
```

when the caller passes an inline-JSX arrow — the compiler lifts that into a
component whose call returns a live Node. In a lazy loop row the value was
stringified before it ever reached the claim door (`String(__x)` in
`stringify/lazy-row.ts`), and the row's content slot is claimed as
`kind: 'text'`, whose writer sets `nodeValue`. A Text node cannot host an
element, so the element was destroyed: the user saw its serialized markup as
visible characters, or `[object HTMLDivElement]`, depending on the DOM
implementation's `toString`.

Two properties made it silent. Nothing overwrote the row afterwards — the
other Node-bearing shapes are self-healing by accident, since a conditional's
`insert()` re-renders through `__bfSlot` and a non-loop reactive text
re-applies through `escapeTextOrNode`, so the wrong value is transient there
and only the lazy row keeps it. And the eligibility gate ACCEPTS the shape: a
prop accessor is an opaque outer read, which the re-subscribe seam
(`spec/slot-unification.md` §9.3a) made eligible, so the row takes the lazy
path and the destructive write is what ships.

The fix keeps the cheap door and decides on the VALUE, in two halves:

- `textOrNode` (new export, `runtime/claim-slots.ts`) passes a Node through and
  coerces anything else with `String`, exactly as the previous inline emission
  did. It is the 'text' door's counterpart to `escapeTextOrNode` — a 'text'
  write goes through `nodeValue` and must NOT be escaped, but it does need the
  Node case separated out. `stringify/lazy-row.ts` emits it in place of
  `String(__x)`.
- The claim **promotes** a slot from 'text' to 'markup' on its first Node
  write, reusing the anchor comment the original claim already resolved (so
  §2's claim-once rule still holds — no second position resolution) and its
  matching `<!--/-->` as the end boundary. `writeMarkup` already splices Nodes
  by identity, so every later write on that id — Node or string — is correct.
  A slot that cannot host a Node (markerless, or missing its end marker) warns
  and skips the write instead of stringifying an element.

Whether such a call yields a string or a Node is not decidable from the
expression's syntax — `renderChild(...)` and `_p.renderCell(...)` are both
`CallExpression` — so this has to be a runtime decision on the value, not a
compile-time classification. Strings keep the Text-node fast path; the added
cost is one `instanceof Node` per content write.

The seed comparison fails safe on its own: `read(id)` answers with a string or
`null`, neither of which is ever `===` a Node, so an outer-involving Node
binding always writes on its first run. That is the right direction — a Node
is freshly built on this run and is never the SSR-rendered content by
identity.
