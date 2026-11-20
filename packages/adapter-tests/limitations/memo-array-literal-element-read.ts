import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A memo reading an element of an array literal by a literal index',
  given:
    'a `createMemo` whose body reads an element of an array literal, written in place or held by a component-scope const (`local[1]`, `grid[0].length`)',
  expected: 'the memo holds the element (or its length) in the server HTML',
  actual: 'renders the memo empty, or `0` where the field is numeric',
  fixtures: ['memo-over-array-const-index'],
})
