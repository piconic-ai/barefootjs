import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Zero-argument call of a local function a template cannot inline',
  given: 'a template expression calling a component or module function with no arguments, where the function takes parameters or its body is more than a single `return <expr>`',
  expected: 'the function runs at render time and its result renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['markup-uninlinable-local-function-named-like-prop'],
})
