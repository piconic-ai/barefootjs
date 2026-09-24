import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Untyped object-literal loop array with no single row shape',
  given:
    'a `.map()` whose rows call a child component, over an unannotated module-scope `const` array of object literals whose rows do not share one set of fields with one plain type each: for example the rows have different keys, or a field is a nested object, a `null`, a non-identifier key, an empty nested array, or a value whose type differs between rows',
  expected: 'the rows render in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['loop-row-child-untyped-array-mismatched-keys', 'loop-row-child-untyped-array-nested-field'],
})
