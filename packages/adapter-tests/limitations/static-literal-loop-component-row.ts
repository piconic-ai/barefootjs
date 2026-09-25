import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Child component in a row of a loop over a static literal array',
  given:
    'a `.map()` over a module- or function-scope `const` initialized with a static array literal, whose row renders a child component nested inside an element',
  expected: 'every row renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['static-literal-loop-component-in-row'],
})
