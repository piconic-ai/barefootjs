import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructure default holding a callback, read through a memo',
  given:
    "a renamed body destructure binding whose default passes a callback to a call (`const { b: local = ['y', ''].filter((x) => x !== '') } = props`), read only through a memo (`createMemo(() => local.length)`), with the prop omitted",
  expected: 'the memo reads the default value',
  actual: 'renders the memo read without the default: empty, or computed over the omitted prop',
  fixtures: ['destructure-default-body-renamed-callback-memo'],
})
