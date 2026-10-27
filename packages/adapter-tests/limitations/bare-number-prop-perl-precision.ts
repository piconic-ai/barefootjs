import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A bare number prop with more than 15 significant digits',
  given: 'a number prop (or its literal destructure default) of 1e15 or more, such as `{ b = 1e20 }`, read bare in text or attribute position',
  expected: 'JS stringifies it with `Number::toString` (`100000000000000000000`)',
  actual: "renders Perl's `%.15g` spelling (`1e+20`)",
  fixtures: ['destructure-default-large-number'],
})
