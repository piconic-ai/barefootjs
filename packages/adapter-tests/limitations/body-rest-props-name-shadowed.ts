import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Props-object body rest used where the props name is shadowed',
  given:
    'a member read or spread of the rest of a component-body destructure of the props object, inside a loop row or callback parameter named like the props object (`const { rows, ...rest } = props`, `rows.map(props => <li {...rest}>{rest.id}</li>)`)',
  expected: "the rest's keys are the component's props, not the row's",
  diagnostic: 'BF101',
  fixtures: ['body-rest-props-name-shadowed'],
})
