import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A component in a loop-row child's forwarded children loses a prop read from the row index",
  given:
    "a `.map()` loop whose row is a single child component with forwarded JSX `children`, where those children nest another component whose prop reads the callback's index parameter rather than the row item (`opts.map((o, i) => <Chip><Mark pos={i}>…</Mark></Chip>)`)",
  expected: 'each row renders the nested component with its own index (`data-pos="0"`, `data-pos="1"`)',
  actual:
    "renders every row's nested component with the prop's zero value instead (the attribute is missing), because the forwarded children render as a separate template that receives the row item but not the row index",
  fixtures: ['loop-row-child-children-nested-index-prop'],
})
