import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An array literal with a spread element read on the server',
  given:
    'an array literal with a spread element (`[...b, \'z\']`), held by a component-scope const or written in a memo body, that the server render reads: in a template position (`local.length`), a child prop (`<Kid n={local.length} />`), a memo body (`createMemo(() => local.length)`, or a literal const method it calls, `api.add()`) or a signal seed (`createSignal(local.length)`)',
  expected: 'the read computes over the spread array (`2` for `b` of one element)',
  diagnostic: 'BF101',
  fixtures: [
    'destructure-default-spread-const-length',
    'destructure-default-spread-const-memo',
    'destructure-default-spread-memo-body',
    'destructure-default-spread-const-signal-seed',
    'destructure-default-spread-method-memo',
    'destructure-default-spread-const-child-prop',
  ],
})
