import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'State computed from JSX children the server renders at template time',
  given:
    'a component whose signal seed or memo reads its children or another JSX-valued prop (`createSignal(props.children ?? \'missing\')`, or one named like the prop that transforms it, `const [children] = createSignal(props.children + \'!\')`), called with JSX children or a JSX prop that read the caller\'s data (`<Note>{props.label}!</Note>`, `header={<i>{props.label}</i>}`) or as the element a loop row returns, whatever its children (`items.map((x) => <Note key={x}>own</Note>)`)',
  expected: "the state holds the children the call passes (`hi!` for `<Note>{props.label}!</Note>`), not the fallback (`'missing'`)",
  diagnostic: 'BF101',
  fixtures: ['children-dynamic-read-into-state', 'children-read-into-state-forms', 'children-read-into-state-shadow-transform', 'open-rest-spread-child-children'],
})
