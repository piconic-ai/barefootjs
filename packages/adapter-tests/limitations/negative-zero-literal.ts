import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A negative zero number literal loses its sign',
  given: 'a `-0` number literal, written in place or as a module array const element (`const NZ = [-0]`), read in arithmetic or a comparison (`1 / NZ[0] < 0`)',
  expected: '`-0` keeps its sign in arithmetic (`1 / -0` is `-Infinity`, so `1 / NZ[0] < 0` is true) and prints as `0`',
  actual: 'renders `1 / NZ[0] < 0` as false: the template spells `-0` as an integer zero, so `1 / NZ[0]` is `Infinity`',
  fixtures: ['module-const-array-negative-zero'],
})
