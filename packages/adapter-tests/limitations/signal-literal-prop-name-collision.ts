import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  title: 'Literal-seeded signal shares a prop name',
  kind: 'silent',
  given: 'a literal-seeded signal whose getter has the same name as a prop, with both arrays rendered independently',
  expected: 'renders the caller-provided prop values and the signal literal values independently',
  actual: 'renders one binding\'s array values in both loops instead of keeping the prop and signal independent',
  fixtures: ['signal-literal-prop-name-collision'],
})
