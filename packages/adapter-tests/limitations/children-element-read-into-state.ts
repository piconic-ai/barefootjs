import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An element child read into state by the component',
  given:
    'a component that reads `props.children` into a signal, bare or with a `??` fallback, or into a `??` memo, and renders it (`const [value] = createSignal(props.children)`, `createSignal(props.children ?? \'missing\')` or `createMemo(() => props.children ?? \'missing\')`, `{value()}`), called with an element as its JSX children (`<Note><i>a</i></Note>`)',
  expected: 'the element renders inside the component (`<b><i>a</i></b>`)',
  actual: "renders the element's markup as escaped text (`&lt;i&gt;a&lt;/i&gt;`)",
  fixtures: ['children-element-read-into-state', 'children-markup-nullish-seed', 'children-markup-nullish-memo'],
})
