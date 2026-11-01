import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Const record indexed by a value of unknown keys',
  given:
    "a component- or module-scope const object literal indexed by a value whose possible keys are not known at compile time (`const labels = { ok: 'Fine' }`, `labels[kind]` with `kind: string`), read as text or a condition",
  expected: 'the value of the key the index holds, including a key inherited from `Object.prototype` (`labels[\'toString\']` is a function, so a condition on it is true)',
  diagnostic: ['BF101', 'BF102'],
  fixtures: ['record-const-index-inherited-key'],
})
