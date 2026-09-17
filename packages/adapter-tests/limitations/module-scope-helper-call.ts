import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Module-scope helper called from a template position',
  given: 'a template expression calling a module-scope helper by bare name (an arrow-valued `const`, a `function` declaration, or a chain of them), in text or boolean-test position',
  expected: 'the helper runs at render time and its result renders in the server HTML',
  diagnostic: ['BF101', 'BF102'],
  fixtures: ['module-const-arrow-helper', 'module-function-helper-chain', 'module-helper-boolcontext-call'],
})
