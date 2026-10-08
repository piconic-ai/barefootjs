import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `.filter()` predicate capture is shadowed by the following `.map()` param of the same name',
  given:
    'a `.filter(t => t === name).map(name => …)` chain inside a row whose own param is `name`, so the predicate captures the enclosing `name` and the following map rebinds it',
  expected: 'the predicate compares each item with the enclosing `name`, so each outer row keeps only its own tag',
  actual:
    'renders every item in each row: the predicate\'s param is renamed to the loop param, so the captured `name` reads the inner loop variable and the comparison is the item with itself (`{% if name == name %}` on Jinja)',
  fixtures: ['filter-capture-shadowed-by-map-param'],
})
