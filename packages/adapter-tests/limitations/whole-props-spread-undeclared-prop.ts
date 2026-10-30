import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An undeclared prop through a whole-props spread',
  given: "a child that spreads its whole props object onto an element (`<b {...props}>`) is passed a prop its props type does not declare",
  expected: 'the undeclared prop renders on the spread element (`title="passed"`)',
  actual: 'drops the undeclared prop from the element',
  fixtures: ['child-undeclared-prop-whole-props-spread'],
})
