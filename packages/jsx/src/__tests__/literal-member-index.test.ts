import { expect, test } from 'bun:test'
import { literalMemberIndex } from '../literal-member-index.ts'

test('canonical array indices share the numeric index path', () => {
  for (const property of ['0', '1', '4294967294']) {
    expect(literalMemberIndex(property)).toEqual({ kind: 'literal', value: Number(property), literalType: 'number' })
  }
})

test('non-index keys retain their exact spelling', () => {
  for (const property of ['data-x', '01', '', '-1', '1.5', '1e2', '4294967295', "it's", 'a\\b']) {
    expect(literalMemberIndex(property)).toEqual({ kind: 'literal', value: property, literalType: 'string' })
  }
})
