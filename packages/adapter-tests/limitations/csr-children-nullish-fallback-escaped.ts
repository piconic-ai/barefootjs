import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Present children under a non-empty nullish fallback in the client template',
  given:
    "a children read with a non-empty nullish fallback (`{(props.children ?? '<b>fallback</b>') ?? ''}`, `{props.children ?? 'fallback'}`) rendered by the client template with children passed",
  expected: 'the children render as markup, and only an absent read renders the escaped fallback',
  actual: 'renders the children markup as escaped visible text: the client template receives children as a plain HTML string and escapes the whole read',
  fixtures: ['children-chained-nullish-fallback-escaped'],
})
