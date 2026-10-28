import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A nested component in a named JSX prop, read in a conditional arm',
  given: 'a named JSX prop whose element contains a nested component, read by the receiving component inside a && or ternary arm',
  expected: 'the arm renders the element with the nested component, which keeps the scope of the component that wrote the JSX',
  actual: 'renders [object Object] in place of the element in a client-mounted arm, or renders the nested component under the receiving component scope when the client renders the arm',
  fixtures: ['jsx-prop-nested-component-conditional'],
})
