import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A block memo whose value only the static evaluator computes',
  given:
    'a block-bodied memo with more than one statement that no template lowers but whose value the static evaluator computes (`if (true) { const label = \'x\' } return label` beside a module `label`), read on the server',
  expected: 'the read renders the computed value (the module const the branch-local does not shadow)',
  actual: 'renders the slot empty',
  fixtures: ['memo-block-branch-local-scope'],
})
