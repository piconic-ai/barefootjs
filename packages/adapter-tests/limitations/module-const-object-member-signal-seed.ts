import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A signal seeded from a member of a module-scope object literal const',
  given:
    "a `createSignal` whose initial value reads a member of a module-scope object literal const (`const CFG = { n: 2, s: 'v' }; createSignal(CFG.n)`), rendered as text",
  expected: 'the server HTML renders the seed (`2`, `v`)',
  actual: 'renders empty',
  fixtures: ['module-const-object-member-signal-seed'],
})
