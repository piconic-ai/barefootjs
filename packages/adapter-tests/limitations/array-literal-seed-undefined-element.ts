import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An `undefined` element of an array-literal signal seed',
  given:
    "a signal seeded from an array literal with an `undefined` element (`createSignal([undefined, 'x'])`), read at that index (`a()[0] === undefined`)",
  expected: 'the element is `undefined`, so `a()[0] === undefined` is true',
  actual: 'renders the element as `null`, so `a()[0] === undefined` is false',
  fixtures: ['undef-array-element-signal-seed'],
})
