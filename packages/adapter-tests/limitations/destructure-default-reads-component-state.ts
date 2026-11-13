import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A destructure default reading a component value no template computes',
  given:
    'a props destructure default that reads, directly or through a component const, a signal, a memo, a `let`, a reassigned const or a function that is not a single `return <expr>` with no parameters (`const L = s() + \'!\'`, `{ b = L }`), where the server render reads the prop',
  expected: 'the omitted prop takes the value the default computes from the component state',
  diagnostic: 'BF101',
  fixtures: ['destructure-default-reads-signal'],
})
