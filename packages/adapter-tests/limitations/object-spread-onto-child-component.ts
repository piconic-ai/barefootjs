import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An object other than the props spread onto a child component',
  given:
    'a child component call that spreads an object other than the component\'s own props: a loop row (`rows.map((r) => <Chip key={r.id} {...r} />)`, also a row named like the props object: `rows.map((props) => <Chip {...props} />)`) or an object prop (`<Chip {...row} />`)',
  expected: 'every key of the object reaches the child, merged with the call\'s explicit props in source order',
  diagnostic: 'BF101',
  fixtures: ['loop-param-named-props-spread-child', 'object-spread-branch-child', 'object-spread-loop-row-child', 'object-spread-prop-child'],
})
