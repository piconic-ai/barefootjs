import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A memo calling a local function named like a typed prop',
  given:
    "a (props)-arg component whose body declares a function named like a typed prop it never destructures (`function value() { return 1 }` with `props: { value?: number }`), called from a memo (`createMemo(() => value())`), with the colliding prop supplied",
  expected: 'the memo calls the local function',
  actual: 'renders the supplied prop instead of the function result',
  fixtures: ['memo-local-function-named-like-prop'],
})
