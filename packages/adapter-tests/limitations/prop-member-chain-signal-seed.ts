import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Signal seeded through a prop member chain that crosses an optional object or a non-object value',
  given:
    "a `createSignal` whose initial value reads a member chain rooted at a prop through an optional object-typed prop (`{ initial }: { initial?: State }`, `createSignal(initial?.label ?? 'none')`) or through an array or primitive member (`createSignal(initial.items.length)`), rendered as text",
  expected: "the server HTML renders the seeded value: the member the caller passed (the fallback when the prop is absent), or the array's length",
  diagnostic: 'BF101',
  fixtures: ['optional-object-prop-member-signal-seed', 'prop-member-length-signal-seed'],
})
