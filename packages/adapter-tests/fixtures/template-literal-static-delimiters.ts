import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'template-literal-static-delimiters',
  componentName: 'TemplateLiteralStaticDelimiters',
  sourceRoot: 'fixture',
  description: 'Template attributes keep literal interpolation delimiters separate from expressions containing a closing brace',
  props: { active: true },
}

export const fixture = defineSharedFixture(spec)
