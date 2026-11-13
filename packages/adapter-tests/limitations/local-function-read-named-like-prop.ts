import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An uncalled read of a local function named like a typed prop',
  given: "a (props)-arg component with a typed prop it never destructures (`props: { value?: number }`) and a local function of the same name that markup reads without calling it (`{value}`); the colliding prop supplied",
  expected: 'the read renders nothing, as JS renders no function',
  actual: 'renders the supplied prop on the server and the function source in the client template',
  fixtures: ['markup-local-function-read-named-like-prop'],
})
