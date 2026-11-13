import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Markup calling a local function that reads a component local',
  given:
    'a template position calling a component-local function declaration (`function value() { return m() }`, `{value()}`) whose body reads a memo or a component const, directly or through another such function',
  expected: "the function's return value",
  actual: 'renders empty, or fails the render, since the template reads the function name as a template variable nothing binds',
  fixtures: ['module-const-inherited-key-function', 'module-const-inherited-key-function-direct', 'module-const-inherited-key-function-nested'],
})
