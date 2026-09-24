import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title:
    "A component in a loop-row child's forwarded children loses a prop read from the row index or a callback-body local",
  given:
    "a `.map()` loop whose row is a single child component with forwarded JSX `children`, where those children nest another component whose prop reads a callback binding other than the row item itself: the index parameter (`opts.map((o, i) => <Chip><Mark pos={i}>…</Mark></Chip>)`) or a local the callback body declares (`const t = o.tone` → `<Mark tone={t}>`)",
  expected:
    'each row renders the nested component with its own value (`data-pos="0"`, `data-pos="1"`; `data-tone="warm"`, `data-tone="cool"`)',
  actual:
    "renders every row's nested component with the prop's zero value instead (the attribute is missing), because the forwarded children render as a separate template that receives the row item but not the row's other bindings",
  fixtures: ['loop-row-child-children-nested-index-prop', 'loop-row-child-children-nested-preamble-prop'],
})
