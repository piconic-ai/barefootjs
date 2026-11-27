import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A spread bag key that is not one attribute name',
  given:
    'an open spread bag (a record prop, an index-signature rest, a signal getter) carrying a key with a space, `=`, `>`, `<`, `/` or a quote (`{ "x onmouseover=alert(1)": "x" }`)',
  expected: 'the key is dropped, and the bag\'s valid keys render',
  actual: 'Renders the key into the markup as it is, so it can close the attribute or add another one (`x onmouseover=alert(1)="x"`)',
  fixtures: ['spread-bag-unsafe-attr-names'],
})
