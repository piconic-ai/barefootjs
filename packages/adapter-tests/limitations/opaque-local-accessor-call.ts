import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Opaque local accessor invoked from a template position',
  given: 'a component-body `const` bound to the result of a call the compiler cannot evaluate (a helper returning a function, or an accessor returned by a library), invoked with `()` in text position',
  expected: 'the accessor runs at render time and its result renders in the server HTML',
  actual: 'emits the slot as a bare template-variable lookup named after the const (an empty slot in the CSR template lambda), with no diagnostic, so the backend renders an empty slot or fails on the unbound name',
  fixtures: ['opaque-local-accessor-call'],
})
