import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Fragment-wrapped branch of a conditional return is never hydrated',
  given: 'a component with an early-return branch whose other branch is wrapped in a fragment (`if (x) return <a/>; return <><button/></>`)',
  expected: 'the rendered branch root carries the component scope id on every render path, so its events bind',
  actual: 'renders the fragment-wrapped branch root without a scope id after hydration (the server HTML is correct, a pure client mount is correct), so its events never bind',
  fixtures: ['conditional-return-fragment-branch'],
})
