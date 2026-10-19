import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A loop filter predicate with no template form',
  given: 'a `.filter(pred).map(…)` loop whose predicate is a conditional (`t => t.done ? t.a : t.b`), a template literal, or another shape outside comparisons joined with `&&` / `||` / `!`',
  expected: 'only the rows the predicate keeps render in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['filter-predicate-shape-loop'],
})
