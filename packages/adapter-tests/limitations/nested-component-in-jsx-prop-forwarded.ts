import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A nested component in a named JSX prop, forwarded to a grandchild',
  given: 'a named JSX prop whose element contains a nested component, passed on by the receiving component as a prop of its own child',
  expected: 'the grandchild renders the element with the nested component, the element keeping the scope of the component that wrote the JSX',
  actual: 'renders nothing in the grandchild, or renders the element under the receiving component scope when the client mounts it',
  fixtures: ['jsx-prop-nested-component-forwarded'],
})
