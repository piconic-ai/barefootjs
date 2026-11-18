import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Component-scope helper called with arguments from a template position',
  given: 'a template expression calling a component-body helper (an arrow-valued `const` or a `function` declaration) with arguments, in boolean-test position',
  expected: 'the helper runs at render time and its result renders in the server HTML',
  diagnostic: ['BF101', 'BF102'],
  fixtures: ['static-loop-conditional-function-helper'],
})
