---
"@barefootjs/jsx": patch
---

Fix #2777: a client component referenced under an import alias (`import { Foo as Bar } from './Foo'`, `<Bar/>`) compiled with no diagnostics, but the parent's emitted client JS registered/initialized/rendered the child under the caller-LOCAL alias (`initChild('Bar', ...)`, `renderChild('Bar', ...)`, `@bf-child:Bar`), while the child's own module always self-registers under its DECLARED/exported name (`hydrate('Foo', ...)`). The runtime registry is keyed by string name, so the lookup missed and the child's hydration (`onMount`, event wiring, everything) silently never ran.

`component-scope.ts` (the existing single door every `initChild`/`renderChild`/`createComponent`/`upsertChild` call already resolves its registry key through) now also resolves an import alias back to the declared name, built from the parsed import metadata the analyzer already collects (`ir.metadata.imports`' `{ name, alias }` — no analyzer change needed). An aliased import takes priority over the existing non-exported-sibling disambiguation, so an aliased reference can never be mistaken for a same-file private sibling of the same declared name.

Adds the shared-corpus fixture `aliased-import-child-component` and discovers a **second**, previously-masked bug it exposed: the `adapter-hono` test-render harness inlines a `components:` child by literal source splice and unconditionally dropped its import line, which is only safe when the local binding equals the declared name — an aliased import left the local name (`AliasedLabel`) undeclared, throwing `ReferenceError` even though the compiler's own output was already correct. Fixed alongside (`test-render.ts`'s `aliasDeclarationsFor`).

Also files #2822 (a separate `known-limitation` issue) for the equivalent bug on every DSL (non-JSX-runtime) adapter's SSR side — confirmed failing at runtime on ERB, Jinja, Mojolicious, Twig, Blade, Xslate, and minijinja, each pinned in its own `render-divergences.ts` — since each of those emits a cross-template/partial call built from the same caller-local alias rather than the declared name, independent of this PR's client-JS fix.
