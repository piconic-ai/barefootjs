import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A children prop renamed in the parameter destructure',
  given:
    "a component whose parameter destructure renames the children prop (`({ children: kids })`) and reads it (`{kids}`, `{kids ?? '<b>x</b>'}`) with children passed",
  expected: 'the present children render as markup; an absent read renders nothing, or the escaped fallback',
  actual:
    'drops the present children (the fallback renders instead), or renders them as escaped visible text instead of markup',
  fixtures: ['children-renamed-param'],
})
