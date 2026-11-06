import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructure default that assigns an earlier binding of its pattern',
  given:
    'a destructure whose default assigns an earlier binding of the same pattern (`let { a = 1, b = (a = 2), c = a } = props`), rendered with the props omitted',
  expected: 'the assignment runs, so a later default reading the earlier binding sees it (`c` renders `2`)',
  actual: 'renders `c` empty or `1`: the server render and the client template read each binding as its prop with its own default, so the assignment never runs',
  fixtures: ['destructure-default-earlier-assignment'],
})
