import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An explicit null prop carried by a props spread onto a child component',
  given:
    'a child component call that spreads the props object after an explicit prop of the same key (`<Child label="first" {...props} />`), called with that key set to `null` or `undefined`',
  expected: 'the spread carries the key, so its `null` / `undefined` overrides the earlier explicit prop',
  actual: 'keeps the earlier explicit prop, as if the caller had omitted the key',
  fixtures: [
    'component-spread-explicit-null',
    'component-spread-explicit-null-positions',
    'component-spread-forwarded-null',
    'component-spread-forwarded-absent',
    'component-spread-explicit-undefined-prop',
    'component-prop-undefined-literal-spread',
  ],
})
