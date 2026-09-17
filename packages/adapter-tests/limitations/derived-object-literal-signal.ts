import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Derived object-literal signal initializer',
  given: 'a `createSignal` / `createMemo` whose initial value is an object literal referencing a live prop (with or without a spread)',
  expected: 'field reads on the signal render the values the caller passed',
  diagnostic: 'BF101',
  fixtures: ['signal-object-spread-init'],
})
