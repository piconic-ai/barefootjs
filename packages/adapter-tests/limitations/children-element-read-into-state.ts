import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Markup children read into state by the component',
  given:
    'a component that reads `props.children` (or a destructured `children` binding) into a signal, bare or with a `??` fallback, or into a `??` memo, and renders it (`const [value] = createSignal(props.children)`, `createSignal(props.children ?? \'missing\')` or `createMemo(() => props.children ?? \'missing\')`, `{value()}`), called with an element as its JSX children (`<Note><i>a</i></Note>`) or with text children that read the caller\'s data (`<Note>{props.label}</Note>`)',
  expected: 'the children render inside the component (`<b><i>a</i></b>`, and the text with the caller\'s text slot markers for text children)',
  actual: "renders the children's markup as escaped text (`&lt;i&gt;a&lt;/i&gt;`)",
  fixtures: ['children-element-read-into-state', 'children-markup-nullish-seed', 'children-markup-nullish-memo', 'children-markup-nullish-seed-bindings', 'children-param-default-nullish-seed'],
})
