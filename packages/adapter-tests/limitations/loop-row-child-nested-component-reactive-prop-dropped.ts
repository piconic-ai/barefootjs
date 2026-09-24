import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A reactive prop on a component nested in a loop-row child's forwarded children is dropped at SSR",
  given:
    "a static `.map()` loop row that calls a child component with forwarded JSX `children`, where those children nest another component whose prop reads a signal or memo (e.g. `<Chip><Mark on={highlight()}>{o.label}</Mark></Chip>` inside `opts.map(o => …)`)",
  expected:
    "the nested component renders with the prop's initial value at SSR, the same as outside a loop",
  actual:
    "renders the nested component with the prop's zero value instead (the attribute it guards is missing), because the row's baked child-component construction only carries literal and boolean-shorthand props",
  fixtures: ['loop-row-child-children-nested-reactive-prop'],
})
