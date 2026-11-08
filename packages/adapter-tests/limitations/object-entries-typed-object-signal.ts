import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '`Object.entries` over a signal typed with a named object type',
  given:
    "an `Object.entries(o()).map(...)` loop over a signal whose type is a named object type (`type O = { a: string; b: string }`, `createSignal<O>({ a: 'x', b: 'y' })`)",
  expected: 'the loop renders one row per member, in insertion order',
  actual: 'throws at render time: the template loop cannot iterate the value',
  fixtures: ['object-entries-typed-object-signal'],
})
