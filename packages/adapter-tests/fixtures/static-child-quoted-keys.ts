import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'static-child-quoted-keys',
  componentName: 'StaticChildQuotedKeys',
  sourceRoot: 'fixture',
  additionalComponents: ['TemplateDelimiterBadge'],
  description: 'A static child\'s quoted key renders as its exact string in data-key, including number- and boolean-looking strings, beside expression keys',
}

export const fixture = defineSharedFixture(spec)
