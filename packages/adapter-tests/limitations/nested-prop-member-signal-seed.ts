import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Signal seeded from a member of an object-typed prop',
  given: 'a `createSignal` whose initial value is a member of an object-typed prop (`createSignal(initial.label)`, `createSignal(initial.items)`), read by the component as text, a conditional, or a loop source, or forwarded to a child component prop',
  expected: 'the server HTML renders the seeded value, as if the member had been passed as a top-level prop',
  actual: 'emits a `nil` seed for the signal, with no diagnostic: its own reads render the zero value (empty text, the falsy branch, an empty loop), and forwarding it to a child prop typed as a primitive makes the generated server code fail to compile',
  fixtures: ['nested-prop-member-signal-seed', 'nested-prop-signal-child-prop'],
})
