import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Zero-argument call of a local function a template cannot inline',
  given: 'a zero-argument call of a component or module function that takes parameters or whose body is more than a single `return <expr>`, read on the server: in a template expression, a memo body or a signal seed, directly or through a const initializer or a function the template inlines',
  expected: 'the function runs at render time and its result renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: [
    'markup-uninlinable-local-function-named-like-prop',
    'memo-uninlinable-local-function-named-like-prop',
    'signal-seed-uninlinable-local-function-named-like-prop',
    'signal-seed-uninlinable-local-function-hides-module-function',
    'signal-seed-const-from-uninlinable-local-function',
    'signal-seed-wrapped-uninlinable-local-function',
  ],
})
