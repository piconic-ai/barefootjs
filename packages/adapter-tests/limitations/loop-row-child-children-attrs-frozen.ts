import { defineLimitation } from '../src/limitations'

// #3143 narrowed this entry's scope: the compiler/client-JS gap it used to
// describe — a loop-row child component's forwarded JSX-children element
// never getting a reactive-attribute effect at all — is fixed (see
// `packages/jsx/src/ir-to-client-js/control-flow/plan/build-component-loop.ts`'s
// `reactiveEffects` wiring). What's left is a SEPARATE, adapter-local
// construction bug: it just happens to be caught by the same fixture.
export default defineLimitation({
  kind: 'silent',
  title:
    "A loop-row child component's forwarded JSX children never reach SSR when the loop's source array is a function-body-local const",
  given:
    "a `.map()` loop row that calls a child component passing a JSX element as `children` (e.g. `<Chip><a href={sig() === item ? …}>…</a></Chip>` inside `items.map(item => …)`), where the loop's source array is declared as a `const` local to the component function body (not at module scope)",
  expected:
    "the row's markup — including the forwarded child element — renders at SSR the same way it does for a module-scope array",
  actual:
    "on an adapter whose loop-array construction the shape defeats (go-template: the generated constructor never populates the corresponding struct slice field for a function-body-local array, only for a module-scope one), the whole loop is silently absent from SSR",
  fixtures: ['loop-row-child-children-attrs'],
})
