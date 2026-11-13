import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Static literal loop array whose rows omit a field',
  given:
    'a `.map()` over a module- or function-scope `const` initialized with an array literal of objects, where some rows omit a field the row body reads',
  expected: 'every row renders in the server HTML, with an attribute bound to the omitted field left out',
  diagnostic: 'BF101',
  fixtures: ['loop-row-absent-optional-member-attr-module-const'],
})
