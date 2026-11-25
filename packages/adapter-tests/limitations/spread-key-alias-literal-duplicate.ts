import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A literal attribute and an open spread bag key that renames to it',
  given:
    'a literal written with a React-style name the reference renames in a spread (`crossOrigin="anonymous"`) before an open spread (`{...rest}`) whose bag carries that key',
  expected: 'the attribute renders once, with the bag\'s value (`crossorigin="use-credentials"`); a key the bag lacks keeps the literal',
  actual: 'Renders the literal beside the bag key kebab-cased (`crossorigin="anonymous" cross-origin="use-credentials"`), so a browser keeps the literal',
  fixtures: ['spread-open-bag-literal-renamed-elsewhere'],
})
