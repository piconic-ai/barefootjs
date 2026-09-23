import { defineLimitation } from '../src/limitations'

// #3143 narrowed this entry's scope: the compiler/client-JS gap it used to
// describe — a loop-row child component's forwarded JSX-children element
// never getting a reactive-attribute effect at all — is fixed (see
// `packages/jsx/src/ir-to-client-js/control-flow/plan/build-component-loop.ts`'s
// `reactiveEffects` wiring). What's left is a SEPARATE, adapter-local
// construction bug: it just happens to be caught by the same fixture.
//
// #3164 fixed a REAL, separate go-template gap this entry used to cite as
// the cause (the loop-array-source lookup accepted a module-scope const
// only, so a function-body-local `const opts = [...]` baked nothing —
// `emitStaticBodyWrappers`/`resolveLoopArraySourceConst` now bake either
// scope the same way, verified against a non-signal-referencing fixture
// shape). That fix does NOT clear THIS fixture, though: `go run`-verifying
// the module-scope form (not just reading the constructor's generated
// source, which is as far as the original note went) surfaces the deeper
// gap `given`/`actual` now describe below, present for either scope —
// go-template's `render-divergences.ts` has the full mechanism. Tracked
// separately as #3170.
export default defineLimitation({
  kind: 'silent',
  title:
    "A loop-row child component's forwarded JSX children can't reach an outer signal/memo at SSR",
  given:
    "a static `.map()` loop row that calls a child component passing a JSX element as `children`, where that element reads an OUTER signal/memo — not just the row's own item (e.g. `<Chip><a href={active() === item ? …}>…</a></Chip>` inside `items.map(item => …)`, module- or function-scope array alike)",
  expected:
    "the row's markup — including the forwarded child element, evaluated against the signal's initial value — renders at SSR the same way a non-loop reference to the same signal does",
  actual:
    "drops the whole loop from SSR silently on an adapter whose per-row forwarded-children rendering has no path back to the enclosing component's own reactive state (go-template: the row's forwarded children render through a companion template executed as a fresh, independent invocation — `bf_tmpl`/`ExecuteTemplate`, `runtime/bf.go` — whose data is the row's own item only, so the signal's field is unreachable from inside it; the adapter detects this and conservatively leaves the loop unbaked rather than emit Go source that would crash at `go run` time)",
  fixtures: ['loop-row-child-children-attrs'],
})
