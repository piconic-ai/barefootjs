import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Zero-argument call of a local function a template cannot inline',
  given: 'a zero-argument call of a component or module function that takes parameters or whose body is more than a single `return <expr>`, read on the server: in a template expression, a memo body or a signal seed',
  expected: 'the function runs at render time and its result renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: [
    'markup-uninlinable-local-function-named-like-prop',
    'memo-uninlinable-local-function-named-like-prop',
    'signal-seed-uninlinable-local-function-named-like-prop',
  ],
})
