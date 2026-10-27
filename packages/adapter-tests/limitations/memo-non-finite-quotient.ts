import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A memo whose quotient is an infinity',
  given: 'a `createMemo` dividing a nonzero number by a literal or runtime zero (`count() / 0`, `count() / props.zero`), read directly or through another memo, in text or attribute position',
  expected: 'JS stringifies the quotient as `Infinity` / `-Infinity`',
  actual: 'renders the host spelling `Inf` / `-Inf`',
  fixtures: ['memo-division-zero-divisor'],
})
