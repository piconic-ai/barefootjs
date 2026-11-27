import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An undeclared prop through a whole-props spread',
  given: "a component that spreads its whole props object onto an element (`<b {...props}>`) is passed a prop its props type does not declare, including one an index signature admits (`props: Record<string, unknown>`)",
  expected: 'the undeclared prop renders on the spread element (`title="passed"`)',
  actual: 'drops the undeclared prop from the element',
  fixtures: ['child-undeclared-prop-whole-props-spread', 'spread-open-props-object-literal-alias-after'],
})
