import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A children fallback const read where a name its initializer reads is shadowed',
  given:
    "a component-scope const holding a `??` / `||` read of the children prop (`const label = props.children ?? '<s>row</s>'`) rendered as text in a loop row whose parameter has the name of something the initializer reads (`[1].map((props) => <li key={props}>{label}</li>)`)",
  expected:
    "the initializer reads the component's props where it is declared: present children render as markup (`<li><i>a</i></li>`), absent children render the fallback as escaped text",
  actual: 'renders the row empty (`<li></li>`)',
  fixtures: ['children-fallback-const-row-shadow'],
})
