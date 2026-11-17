import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A component-body statement that mutates a binding, read by rendered output',
  given:
    "a top-level statement in the component body that mutates a binding after its declaration (`local.push('z')` over `const { b: local = [...] } = props`), with the binding read in rendered output through a memo (`createMemo(() => local.length)`)",
  expected: 'the rendered output reads the mutated binding (the memo is `2`), and the server HTML and the hydrated DOM agree',
  actual:
    'renders the value before the statement ran (`1`) in the server HTML, since a body statement runs only on the client at mount, and renders the memo empty in the client template',
  fixtures: ['destructure-default-body-mutated-memo'],
})
