import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'template-literal-attribute-escape',
  componentName: 'TemplateLiteralAttributeEscape',
  sourceRoot: 'fixture',
  description:
    'Flat and nested attribute template literals HTML-escape `"`, `<`, `>`, `&` in their literal segments',
  props: { tag: 'ok' },
}

export const fixture = defineSharedFixture(spec)
