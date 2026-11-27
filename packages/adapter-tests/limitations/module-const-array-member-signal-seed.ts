import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A signal seeded from a member of a module-scope literal array const',
  given:
    "a `createSignal` whose initial value reads a member of a module-scope literal array const (`const ALL = ['y', 'z']; createSignal(ALL.length)`, `ALL[1]`, `ALL.join('-')`), the const written as a literal or built with a spread of one, rendered as text",
  expected: 'the server HTML renders the seed (`2`)',
  actual: 'renders the seed type\'s zero value (`0`, or empty)',
  fixtures: ['module-const-array-member-signal-seed', 'module-const-array-spread-signal-seed'],
})
