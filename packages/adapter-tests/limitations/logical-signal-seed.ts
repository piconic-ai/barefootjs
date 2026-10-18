import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A signal seeded by a logical expression over a prop',
  given: "a signal whose initializer is a logical expression over a prop (`createSignal(props.label || 'none')`, `createSignal(props.flag && 'on')`)",
  expected: "the signal starts at the expression's value",
  actual: 'seeds the bare prop (dropping a `||` fallback) or nil, so the server renders the wrong value',
  fixtures: ['signal-prop-seed-logical-fallback'],
})
