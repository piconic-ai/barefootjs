import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'JSX children the server renders at template time forwarded into a nested component prop',
  given:
    "a component that forwards its JSX children into a prop of a nested component (`<Plain seed={props.children} />`), which reads the prop without computing state of its own from it (`{props.seed ? 'children' : 'fallback'}`, or a signal named like the prop that passes it through, `const [seed] = createSignal(props.seed ?? 'none')`), called with JSX children that read the caller's data (`<Inner>{props.label}</Inner>`)",
  expected: 'the nested component reads the forwarded children (`children`)',
  actual: 'the nested component reads the prop as absent (`fallback`)',
  fixtures: ['children-forwarded-into-child-prop-plain'],
})
