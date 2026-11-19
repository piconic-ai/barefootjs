import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Const object built with a spread of a source a template cannot expand',
  given:
    "a module- or component-scope const object literal that spreads a source the compiler cannot expand into its own entries (a call `{ ...mk() }`, a member of a non-literal `{ ...R.sub }`, a `let`, an array literal), read with a key no entry lists after the last such spread (`B.k`), in a server-rendered position",
  expected: 'the value the spread brings for that key',
  diagnostic: ['BF101'],
  fixtures: [
    'module-const-object-spread-unresolved-call',
    'module-const-object-spread-unresolved-member',
    'module-const-object-spread-unresolved-let',
    'module-const-object-spread-unresolved-array',
    'module-const-object-spread-unresolved-local',
  ],
})
