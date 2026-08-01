---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/go-template": patch
---

Lower a `.map()` callback preamble's value declarations to per-row template locals (#2447)

A block-body `.map()` whose preamble computes a value used in the row —

```tsx
{rows().map(row => {
  const cls = row.done ? 'done' : 'open'
  return <li key={row.id} class={cls}>{row.label}</li>
})}
```

— carried that preamble only as JS text, which a template language cannot
execute. Every DSL adapter emitted the row anyway, reading a name it never
assigned: ERB read `v[:cls]` (an unseeded vars-Hash key), Go read `$.Cls` (a
parent-struct field, the same hoisted-to-parent defect class as #2445), and
Blade / Twig / Jinja / minijinja / Kolon / Mojo each read a bare undefined
local. All eight rendered `class=""`, with no diagnostic. Hono and CSR were
correct throughout, so the divergence only showed up against a real DSL
runtime.

Fixed by giving the preamble a second, backend-neutral carrier:
`MapCallbackPreamble.declarations`, one `{ name, valueParsed }` per
declaration. Each adapter emits it as a per-row local in its own syntax
(`{% set %}`, `@php()`, `<%- … -%>`, `: my $x = …;`, `{{$x := …}}`) through the
same `ParsedExpr` door it already uses for the loop array, the filter
predicate, and the sort comparator — no new expression path, and no
per-adapter interpretation of the JS text. Declarations render in source
order, so a later initializer sees an earlier local; on a
`.filter(p).map(cb)` chain they render inside the filter guard, matching JS
evaluation order. The declared names are registered as loop-bound, so a
same-named module const can't inline over the local the loop just declared.

Lowering is all-or-nothing. A preamble is an order-dependent statement
sequence, so carrying its declarable prefix and dropping the rest would put
the missing statement's effect nowhere — the same silent divergence in a new
disguise. One statement that is not a value declaration (an assignment, an
imperative loop, a destructuring binding, an initializer outside the
expression subset) therefore refuses on a DSL target with `BF021` and the
`/* @client */` escape, alongside the existing filter / sort / array-builder /
flatMap gates. A JS runtime keeps running any preamble verbatim.

Two behaviour changes fall out of this:

- **`map-preamble-branch-body` now renders on every adapter.** Its `BF021`
  pins are removed from all eight DSL adapters. They existed on the premise
  that a loop-local cannot be carried into a conditional branch template; that
  stopped being true once a value preamble lowers, because the if/else fold
  puts the conditional *inside* the loop body, where the local is in scope in
  both arms. The refusal now keys off whether the preamble is declarable, not
  whether the body branches.
- **A non-declarable preamble that used to compile is now a build error on DSL
  targets.** It previously produced a template that read unassigned names, so
  the change is from silently-wrong output to a diagnostic with a documented
  escape.

The `loop-preamble-attr-value` fixture's render divergences are graduated
(deleted from all eight `render-divergences.ts` files). Both fixtures now pass
on all nine adapters and CSR conformance.

Unchanged and tracked separately: an attribute whose value comes from a
preamble local is still not classified as reactive on the client, so it is
interpolated into the row template and not rewritten on a same-key item
update. That is a client-side classification question, pinned as the current
contract in `packages/client/__tests__/runtime/lazy-row-preamble.test.ts`.
