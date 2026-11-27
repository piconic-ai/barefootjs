import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Children forwarded from a call that passes none',
  given:
    'a component that forwards its children to a child as a prop (`<Check children={props.children} />`), called without children (`<Outer />`)',
  expected: 'the child reads `props.children` as `undefined` (`props.children === undefined` is true)',
  actual: 'throws while rendering the forwarding component, because the template passes an undefined variable on',
  fixtures: ['children-absent-forwarded'],
})
