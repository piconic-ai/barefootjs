import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Untyped object-literal loop array with a field that has no plain value type',
  given:
    'a `.map()` whose rows call a child component with forwarded JSX children, over an unannotated module-scope `const` array of object literals that share their keys but carry a field that is not a plain string, number or boolean literal (a nested object, a `null`, a non-identifier key)',
  expected: 'the rows render in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['loop-row-child-children-untyped-array-nested-field'],
})
