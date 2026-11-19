import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A binding a component-body statement writes, read as it was declared',
  given:
    "a top-level statement in the component body that writes a binding after its declaration (`local.push('z')`, a reassignment, a property write), with the binding read by the markup (`{local.length}`) or by a signal seed, memo or constant declared after the statement (`createMemo(() => local.length)`)",
  expected: 'the read sees what the statement wrote (`2`), as JS does',
  diagnostic: 'BF101',
  fixtures: ['destructure-default-body-mutated-memo', 'body-statement-write-direct-read', 'body-statement-write-block-shadowed-callback', 'body-statement-write-computed-method-name'],
})
