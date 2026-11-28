import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A memo returning an object literal with a computed key',
  given:
    "a memo whose body is an object literal with a computed key (`createMemo(() => ({ ['k']: o.k }))`), whose member the server render reads (`m().k`)",
  expected: 'the read renders the value the member holds (`v`)',
  diagnostic: 'BF101',
  fixtures: ['memo-object-body-computed-key-module-const'],
})
