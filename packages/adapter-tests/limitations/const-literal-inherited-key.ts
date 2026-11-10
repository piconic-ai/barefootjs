import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Literal const read with a key only its prototype has',
  given:
    "a module- or component-scope array or object literal const read with a literal key the literal does not list but its prototype does (`const REC = { k: 'v' }`, `REC['toString']`; `const QS = ['a']`, `QS['map']`), in a server-rendered position or in the body of a memo one reads",
  expected: 'the inherited function (`Object.prototype.toString`, `Array.prototype.map`), so a condition on the read is true',
  diagnostic: ['BF101'],
  fixtures: [
    'module-const-inherited-key',
    'module-const-inherited-key-memo',
    'module-const-inherited-key-memo-chain',
    'module-const-inherited-key-memo-mixed',
  ],
})
