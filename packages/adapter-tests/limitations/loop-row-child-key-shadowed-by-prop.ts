import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Component loop row keyed by a row field the component also takes a same-named prop for',
  given:
    'a `.map()` over an array prop of objects whose row is a child component with no children, keyed by a field of the row object whose name the component also takes as a prop, passed a different row field (`props.items.map(item => <Badge key={item.id} id={item.slug} label={item.label} />)`)',
  expected:
    'one component per row, each keyed by the row field and given the prop (`data-id="x" data-key="a"` … `A`, `data-id="y" data-key="b"` … `B`)',
  actual:
    "renders each row's `data-key` from the child's same-named prop instead of the row field (`data-key=\"x\"`, `data-key=\"y\"`): the props constructor reads the key off each row's child-component input",
  fixtures: ['loop-row-child-key-shadowed-by-prop'],
})
