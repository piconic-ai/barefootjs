import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: "A scalar loop row's forwarded children can't nest a component at SSR",
  given:
    'a `.map()` over an array of strings or numbers whose row is a child component passing JSX children, where those children render another component (e.g. `props.picks.map(g => <Tag key={g}><Badge label={g} /></Tag>)`)',
  expected: "every row renders its wrapper with the nested component's markup inside it",
  diagnostic: 'BF101',
  fixtures: ['loop-row-child-scalar-row-wrapper-nested-component'],
})
