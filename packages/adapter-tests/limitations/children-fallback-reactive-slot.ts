import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A children fallback read whose fallback is reactive',
  given:
    "a client component that renders a `??` / `||` read of `props.children` whose fallback reads another prop or a signal (`{props.children ?? props.alt}`, `{props.children || text()}`), directly or through a body const (`const label = props.children ?? props.alt`), called with an element as its JSX children (`<Alt><i>a</i></Alt>`)",
  expected: 'the element renders inside the read\'s text slot (`<!--bf:s0--><i>a</i><!--/-->`); absent children render the fallback as escaped text',
  actual: "renders the element's markup as escaped text (`&lt;i&gt;a&lt;/i&gt;`)",
  fixtures: ['children-fallback-reactive-read'],
})
