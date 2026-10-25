import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

const text = '` \\ ${notCode}'

export const spec: SharedFixtureSpec = {
  id: 'jsx-prop-template-delimiters',
  componentName: 'JsxPropTemplateDelimiters',
  sourceRoot: 'fixture',
  additionalComponents: ['TemplateDelimiterCard', 'TemplateDelimiterBadge'],
  description: 'JSX prop getters preserve static template delimiters alongside a nested component and forwarded children',
  interactions: [
    { type: 'expectAttribute', selector: 'header span', attribute: 'title', value: text },
    { type: 'expectContains', selector: 'header span', text },
    { type: 'expectText', selector: 'em', text: 'badge' },
    { type: 'expectText', selector: 'p', text },
  ],
}

export const fixture = defineSharedFixture(spec)
