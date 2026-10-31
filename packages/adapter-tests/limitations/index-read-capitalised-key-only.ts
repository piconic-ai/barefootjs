import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Lowercase index key on an object holding only the capitalised key',
  given:
    'an index read `obj[k]` whose key starts with a lowercase letter, on an object that has no such key but has the same key with its first letter capitalised (`{ Name: "upper" }["name"]`)',
  expected: 'the read is `undefined`',
  actual: 'renders the value of the capitalised key',
  fixtures: ['index-read-capitalised-key-only'],
})
