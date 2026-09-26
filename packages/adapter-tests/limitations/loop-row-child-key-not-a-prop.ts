import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Component loop row keyed by a row field the component takes no prop for',
  given:
    'a `.map()` over an array prop of objects whose row is a child component with no children, keyed by a field of the row object the component has no same-named prop for (`props.items.map(item => <Badge key={item.id} label={item.label} />)`, where `Badge` takes only `label`)',
  expected: 'one component per row, each with its own key and prop (`data-key="a"` … `A`, `data-key="b"` … `B`)',
  actual:
    "emits code that fails to build: it reads the key field off the child component's input struct, which has no such field (`BadgeInput has no field or method ID`)",
  fixtures: ['loop-row-child-key-not-a-prop'],
})
