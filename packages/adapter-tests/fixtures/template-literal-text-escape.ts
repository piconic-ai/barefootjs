import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'template-literal-text-escape',
  componentName: 'TemplateLiteralTextEscape',
  sourceRoot: 'fixture',
  description:
    'A nested text-position template literal HTML-escapes `"`, `<`, `>`, `&` in its literal segments',
  props: { tag: 'ok' },
}

export const fixture = defineSharedFixture(spec)
