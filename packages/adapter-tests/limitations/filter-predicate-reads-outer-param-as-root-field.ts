import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `.filter()` predicate reads an enclosing loop param as a root field',
  given:
    'a `.filter()` predicate inside a nested loop that compares against an enclosing row\'s item param (`tags.map(name => tags.filter(t => t === name).map(…))`)',
  expected: 'the predicate reads the enclosing row\'s item, so each inner row keeps only its own matching tag',
  actual:
    'throws at render on go-template: the predicate lowers the enclosing param to a root-scope field (`$.Name`) instead of its range variable (`$name`), and the root Props struct has no such field',
  fixtures: ['nested-loop-filter-captures-shadowing-param'],
})
