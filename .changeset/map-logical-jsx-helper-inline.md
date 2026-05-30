---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/shared": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Reactive whole-item conditionals in loops (#1665).

`arr.map(t => cond(t) && <li/>)` (and `cond ? <li/> : null`, `expr || <li/>`,
`expr ?? <li/>`) makes the conditional the entire loop item, so an item renders
0-or-1 element per pass. Previously this either threw at hydration (the loop's
children stayed empty and the whole `.map(...)` was emitted verbatim as
reactive text — uncompiled inline JSX, undeclared module-level helpers) or, once
compiled, crashed at runtime (`firstElementChild.cloneNode` on a null element)
or froze at its server-rendered value.

This is now fully reactive, with identical behaviour whether the array is a
`const` or a `signal()`:

- **Runtime** — new `mapArrayAnchored` tracks each item by an always-present
  `<!--bf-loop-i:KEY-->` anchor comment (not a root element, which the item may
  not have); content lives between the anchor and the next anchor / loop end and
  is derived from the live DOM range each pass. `insert()` accepts the anchor as
  its scope so a whole-item conditional toggles range-scoped to its own item.
- **Compiler** — detect the whole-item conditional, hoist the key from the
  rendering branch, emit per-item anchors plus a `mapArrayAnchored` renderItem;
  static-array bodies route through the same path. Logical (`&&`/`||`/`??`) and
  ternary JSX-helper map bodies are inlined, and BF023 now requires a key on
  those bodies.
- **SSR adapters** — Hono, Go, and Mojo emit the per-item `bf-loop-i:KEY` anchor
  so server-rendered lists hydrate. Hono also emits `data-key` on the
  conditional branch's loop-item root, matching Go / CSR.

Both-branch-element ternaries (`cond ? <A/> : <B/>`) render exactly one element
and keep their existing `mapArray` path.
