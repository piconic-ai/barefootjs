import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A member read of a loop row parameter named `props`',
  given:
    'a `.map()` row whose parameter is named `props` reading a member of it (`rows.map((props) => <li>{props.label}</li>)`)',
  expected: "each row renders its own item's member (`props.label` of that row)",
  actual: "renders the component's prop of that name instead (empty when there is none): the template reads `props.<member>` as a root prop",
  fixtures: ['loop-param-named-props-member'],
})
