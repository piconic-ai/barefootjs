import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'jsx-prop-nested-component-conditional',
  componentName: 'JsxPropNestedComponentConditional',
  sourceRoot: 'fixture',
  additionalComponents: ['SlotConditionalCard', 'TemplateDelimiterBadge'],
  description: 'A named JSX prop holding a nested component, read inside the receiving component\'s && and ternary arms',
  interactions: [
    { type: 'expectText', selector: 'div.and span.h em', text: 'badge' },
    { type: 'expectText', selector: 'div.ternary b.f em', text: 'badge' },
  ],
}

export const fixture = defineSharedFixture(spec)
