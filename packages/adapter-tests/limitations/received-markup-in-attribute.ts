import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Markup a component receives bound into an attribute',
  given:
    'a component that binds markup it receives into an element attribute: its JSX children, read directly or held in state (`title={props.children}`, `const [value] = createSignal(props.children)` with `title={value()}`, in a template literal or a conditional attribute), or a JSX-valued prop (`title={props.header}`), called with an element whose own attributes are quoted (`<i className="label">hello</i>`)',
  expected: 'the attribute holds the markup as escaped text, quotes included (`title="&lt;i class=&quot;label&quot;&gt;hello&lt;/i&gt;"`), and element content renders it as markup',
  actual: 'renders the markup unescaped inside the attribute, so its quotes end the value (`title="<i class="label">hello</i>"`), or renders its text only or `[object Object]`, or throws',
  fixtures: ['received-markup-in-attribute'],
})
