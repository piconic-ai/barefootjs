import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Signal seeded through a prop member chain that is not a plain path to an object field',
  given:
    "a `createSignal` whose initial value reads a member chain rooted at a prop through an optional object-typed prop (`{ initial }: { initial?: State }`, `createSignal(initial?.label ?? 'none')`), through an array or primitive member (`createSignal(initial.items.length)`), or inside a larger expression (`createSignal(initial.count + 1)`), rendered as text",
  expected: "the server HTML renders the seeded value: the member the caller passed (the fallback when the prop is absent), the array's length, or the computed expression",
  diagnostic: 'BF101',
  fixtures: ['optional-object-prop-member-signal-seed', 'prop-member-length-signal-seed', 'embedded-prop-member-signal-seed'],
})
