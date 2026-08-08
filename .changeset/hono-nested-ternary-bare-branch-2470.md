---
"@barefootjs/hono": patch
---

Fix Hono adapter emitting invalid `.tsx` for a nested ternary chain nested in a non-reactive outer conditional's alternate (#2470)

```tsx
const MODE = 'b'
export function Chain() {
  return <div>{MODE === 'a' ? <span>A</span> : MODE === 'b' ? <span>B</span> : <span>C</span>}</div>
}
```

used to emit

```tsx
{MODE === 'a' ? <span>A</span> : {MODE === 'b' ? <span>B</span> : <span>C</span>}}
```

— the nested conditional got re-wrapped in its own `{…}` while sitting in
the ALTERNATE position of the outer ternary, where only a plain JS
expression is legal, so the generated `.tsx` failed to parse
(`Expected "}" but found "==="`) with zero diagnostics.

Only reachable when the OUTER conditional's condition is non-reactive (no
signal/prop/call — e.g. a module-level `const`), which takes the flat
`cond ? whenTrue : whenFalse` path instead of the reactive marker-wrapping
path (`wrapWithCondMarker`), so the existing `nested-ternary` fixture
(reactive outer condition) never caught it.

`renderConditional` now splits its output into `renderConditionalBody`
(the bare ternary text) plus the enclosing `{…}` it alone adds. A new
`renderBareBranch` helper renders a non-reactive conditional's branches
through `renderConditionalBody` directly when a branch is itself a nested
conditional, instead of falling through to the generic `renderNode`/
`emitConditional` dispatch that re-wraps it. The reactive path (marker
splicing via `wrapWithCondMarker`) is unchanged.

New conformance fixture: `nested-ternary-bare-branch`
(`packages/adapter-tests/fixtures/nested-ternary-bare-branch.ts`), modeled
on `nested-ternary.ts` but with a non-reactive module-const outer
condition — the shape the existing fixture doesn't exercise.

Other adapters (Go template, ERB, Jinja, Twig, Mojolicious, Blade, Rust
minijinja, Xslate) emit their own template-tag syntax (`{{ }}`, `<% %>`,
etc.), not raw JS `{…}` expression containers, so they aren't exposed to
this specific double-brace hazard — Hono is the only JSX-runtime adapter
in the workspace.
