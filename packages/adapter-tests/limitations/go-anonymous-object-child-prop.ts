import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A prop typed as an anonymous object type forwarded to a child',
  given:
    "a prop typed as an inline object type (or an inline intersection) passed whole to a child component whose own prop is typed by another inline object type of the same shape (`<Show data={props.data} />`)",
  expected: "the child's render of the members (`y:2`)",
  actual:
    "emits a program that does not build, since the parent's and the child's synthesized structs are distinct Go types and the parent assigns its own to the child's field",
  fixtures: ['inline-object-prop-child-forward'],
})
