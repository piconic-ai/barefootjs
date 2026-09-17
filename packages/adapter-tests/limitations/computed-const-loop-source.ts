import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Computed component-scope const as a loop source',
  given: 'a `.map()` whose array is a component- or module-scope `const` computed from props or a function call',
  expected: 'the rows render in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['static-array-from-props', 'static-array-from-props-with-component', 'module-const-loop-source-computed'],
})
