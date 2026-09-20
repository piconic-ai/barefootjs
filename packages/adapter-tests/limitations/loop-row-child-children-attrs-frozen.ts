import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title:
    "Reactive attributes on a JSX element passed as a loop-row child component's children are never patched after hydration",
  given:
    "a `.map()` loop row that calls a child component passing a JSX element as `children`, where that element carries its own reactive attributes (e.g. `<Chip><a href={sig() === item ? …}>…</a></Chip>` inside `items.map(item => …)`)",
  expected:
    "the row's markup re-renders on every signal update the same way it does outside a loop: the forwarded element's attributes track the live signal value",
  actual:
    'keeps the attribute at whichever value the signal held when the row was built during SSR/CSR-template construction; no effect is ever emitted for it, so nothing touches it again after that',
  fixtures: ['loop-row-child-children-attrs'],
})
