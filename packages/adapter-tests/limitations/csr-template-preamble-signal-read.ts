import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A signal read in a loop row preamble, in the CSR template',
  given: 'a `.map()` callback whose preamble local reads a component signal (`const label = row.name + suffix()`), in a component the page mounts from the client template instead of from server HTML',
  expected: 'the template computes the local from the signal\'s initial value, as it does for a signal read in the row\'s JSX',
  actual: 'copies the preamble statement into the module-scope template lambda unchanged, where the signal getter is not declared, so mounting the component throws a ReferenceError; a page hydrated from server HTML is not affected, since the template is not evaluated',
  fixtures: ['keyed-row-branch-preamble-signal'],
})
