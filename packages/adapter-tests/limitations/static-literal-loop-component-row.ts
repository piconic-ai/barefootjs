import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Child component in a row of a loop over a static literal array',
  given:
    'a `.map()` over a module- or function-scope `const` initialized with a static array literal, whose row renders a child component anywhere other than as the row root (inside an element, a conditional branch or a nested loop)',
  expected: 'every row renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['static-literal-loop-component-in-row'],
})
