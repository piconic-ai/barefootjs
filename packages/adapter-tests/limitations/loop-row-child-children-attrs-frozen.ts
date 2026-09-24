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
// shape). That fix did NOT clear THIS fixture, though: `go run`-verifying
// the module-scope form (not just reading the constructor's generated
// source, which is as far as the original note went) surfaced a deeper
// gap — go-template's `render-divergences.ts` used to carry the full
// mechanism, before #3170 (below) moved it here.
//
// The adapter now refuses this shape with BF101
// (`emitStaticBodyWrappers`'s `bodyChildrenReferenceOuterReactiveState`
// guard) instead of silently leaving the loop unbaked. Reaching outer
// reactive state from a static loop's forwarded children still has no
// lowering there; only its visibility changed.
export default defineLimitation({
  kind: 'refusal',
  title:
    "A loop-row child component's forwarded JSX children can't reach an outer signal/memo at SSR",
  given:
    "a static `.map()` loop row that calls a child component passing a JSX element as `children`, where that element reads an OUTER signal/memo — not just the row's own item (e.g. `<Chip><a href={active() === item ? …}>…</a></Chip>` inside `items.map(item => …)`, module- or function-scope array alike)",
  expected:
    "the row's markup — including the forwarded child element, evaluated against the signal's initial value — renders at SSR the same way a non-loop reference to the same signal does",
  diagnostic: 'BF101',
  fixtures: ['loop-row-child-children-attrs'],
})
