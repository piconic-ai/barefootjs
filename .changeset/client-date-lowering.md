---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
---

Close #2292: apply the catalogued `Date` lowering (#2274) on the client-JS
(CSR) path, not just SSR. A `Date`-typed prop's zero-arg accessor call
(`createdAt.toISOString()`, `createdAt.getUTCFullYear()`, …) now works after
hydration instead of throwing.

- `@barefootjs/client` gains a `date(recv, op)` runtime helper (importable
  from `@barefootjs/client/runtime`), the client counterpart to every SSR
  adapter's `date` helper. `recv` tolerates a real `Date` OR the ISO-8601
  string a Date-typed prop arrives as post-hydration (props are JSON
  round-tripped with no type-aware revival); a nil/unparseable receiver
  degrades to the documented zero value (`''` for `toISOString`, else `0`)
  rather than throwing. Semantics match the SSR runtimes byte-for-byte
  (0-based `getUTCMonth`, UTC millisecond `toISOString`).
- `@barefootjs/jsx`: the client emitter now lowers the same calls
  `datePlugin` lowers on the SSR side — reusing the exact `datePlugin`
  matcher (not a re-implementation), so SSR and CSR stay in parity — on both
  the static template path (`jsx-to-ir.ts`) and the reactive
  `createEffect` path (`ir-to-client-js/emit-reactive.ts`), emitting
  `date(<recv>, "<op>")` and auto-importing the runtime helper. A call
  lowers on the client iff it lowers on the server.
