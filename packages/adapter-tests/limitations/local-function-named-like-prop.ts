import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A local or module binding named like a typed prop',
  given:
    "a (props)-arg component with a typed prop it never destructures (`props: { value?: number }`) and a binding of the same name it reads: a local function (`function value() { return 1 }`) called from a memo, a signal seed or markup, an ordinary const declared after the memo that reads it, or a module-scope const read by a memo; the colliding prop supplied",
  expected: 'the read resolves to the binding',
  actual: 'renders the supplied prop, or nothing, instead of the binding',
  fixtures: [
    'memo-local-function-named-like-prop',
    'signal-seed-local-function-named-like-prop',
    'markup-local-function-named-like-prop',
    'memo-const-declared-after-named-like-prop',
    'memo-module-binding-named-like-prop',
  ],
})
