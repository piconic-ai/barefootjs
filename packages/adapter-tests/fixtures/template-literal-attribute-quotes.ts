import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'template-literal-attribute-quotes',
  componentName: 'TemplateLiteralAttributeQuotes',
  sourceRoot: 'fixture',
  description: 'An attribute template expression escapes quotes in outer and nested literal segments',
  props: { tag: 'ok' },
}

export const fixture = defineSharedFixture(spec)
