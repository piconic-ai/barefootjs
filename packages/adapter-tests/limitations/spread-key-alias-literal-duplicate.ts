import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A literal attribute and an open spread bag key that renames to it',
  given:
    'a literal written with a React-style name a spread renames (`htmlFor="explicit"`) before an open spread (`{...rest}`) whose bag carries that key (`htmlFor`)',
  expected: 'the attribute renders once, with the bag\'s value (`for="spread"`); a key the bag lacks keeps the literal',
  actual: 'Renders the attribute twice (`for="explicit" for="spread"`), so a browser keeps the literal',
  fixtures: ['spread-open-bag-literal-alias-before'],
})
