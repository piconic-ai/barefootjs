import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Signal seeded from a member of an object-typed prop',
  given: 'a `createSignal` whose initial value is a member of an object-typed prop (`createSignal(initial.label)`, `createSignal(initial.items)`), read by the component as text, a conditional, or a loop source, or forwarded to a child component prop',
  expected: 'the server HTML renders the seeded value, as if the member had been passed as a top-level prop',
  diagnostic: 'BF101',
  fixtures: ['nested-prop-member-signal-seed', 'nested-prop-signal-child-prop'],
})
