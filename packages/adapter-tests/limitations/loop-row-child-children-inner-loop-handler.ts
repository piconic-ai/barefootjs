import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "An event handler in an inner loop of a loop-row child component's forwarded children",
  given:
    "a `.map()` row that is a child component whose forwarded `children` hold an inner `.map()` with an event handler (`<Chip key={o.id}><ul>{o.tags.map((tag) => <li key={tag}><button onClick={…}/></li>)}</ul></Chip>`)",
  expected: 'each click runs the handler for its own inner item and row, in a hydrated row and in a row built on the client',
  actual: 'drops the click: no handler is attached to the element',
  fixtures: ['loop-row-child-children-inner-loop-handler'],
})
