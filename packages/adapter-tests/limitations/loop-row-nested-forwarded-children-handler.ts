import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An event handler forwarded through a child component nested below a loop row element',
  given:
    "a `.map()` row whose element with an event handler is forwarded as the `children` of a child component that is not the row's root — nested inside the row's root component (`<Chip key={o.id}><Chip><button onClick={…}/></Chip></Chip>`) or inside a plain-element row (`<div key={o.id}><Chip><button onClick={…}/></Chip></div>`)",
  expected: 'each click runs the handler for its own row, in a hydrated row and in a row built on the client',
  actual: 'drops the click: no handler is attached to the element',
  fixtures: ['loop-row-nested-child-children-handler'],
})
