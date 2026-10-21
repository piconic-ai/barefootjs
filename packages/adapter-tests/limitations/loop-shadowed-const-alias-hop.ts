import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const alias hop read in a loop row that shadows a name the hop passes through',
  given:
    'a component-scope const alias chain (`const a = children; const b = a`, `const c = children`) read inside a `.map()` row whose parameter has a name the chain passes through (`rows.map(a => …{b}…)`, `rows.map((children, i) => …{c}…)`)',
  expected: 'the read renders the value the const chain holds (here the passed children, as markup)',
  actual: 'renders nothing, or fails to render: the template reads the const as a variable that is never set',
  fixtures: ['children-alias-hop-shadowed-intermediate'],
})
