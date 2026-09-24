import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Opaque local accessor invoked from a template position',
  given: 'a component-body `const` bound to the result of a call the compiler cannot evaluate (a helper returning a function, or an accessor returned by a library), invoked with `()` in text position',
  expected: 'the accessor runs at render time and its result renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['opaque-local-accessor-call'],
})
