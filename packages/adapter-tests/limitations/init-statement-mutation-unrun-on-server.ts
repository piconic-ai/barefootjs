import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A binding a component-body statement writes, handed to a child component',
  given:
    "a top-level statement in the component body that mutates a binding after its declaration (`items.push('z')` over `const items = ['y']`), with the binding passed to a child component as a prop (`<Child items={items} />`) that the child renders",
  expected: 'the child renders the mutated binding (`2`), as JS does, and the server HTML and the hydrated DOM agree',
  actual:
    'renders the binding as declared (`1`), or as empty (`0`) on the template adapters, in the server HTML, since a body statement runs only on the client at mount, where the child then reads the mutated binding',
  fixtures: ['body-statement-write-child-prop'],
})
