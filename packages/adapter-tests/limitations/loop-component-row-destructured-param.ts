import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A component loop row loses its row values when the callback destructures the row param",
  given:
    "a `.map()` loop over a memo whose callback destructures its row param and whose row body is a component keyed by a destructured field, receiving a destructured field as a prop on itself or on a component in its forwarded children (`shown().map(({ id, tone }) => <Mark key={id} tone={tone} />)`, `shown().map(({ id, tone }) => <Chip key={id}><Mark tone={tone} /></Chip>)`)",
  expected:
    'one component per row, each with its own key and prop (`data-key="a" data-tone="warm"`, `data-key="b" data-tone="cool"`), hydrated with the same values',
  actual:
    "renders no rows at all, or rows without their `data-key` and without the destructured prop; and the emitted client JS reads the destructured name where it is not bound (`get tone() { return tone }`), so hydrating or creating a row throws a `ReferenceError`",
  fixtures: ['loop-component-row-destructured-param', 'loop-row-child-children-nested-destructured-prop'],
})
