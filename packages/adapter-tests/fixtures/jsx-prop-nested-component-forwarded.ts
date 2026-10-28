import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'jsx-prop-nested-component-forwarded',
  componentName: 'JsxPropNestedComponentForwarded',
  sourceRoot: 'fixture',
  additionalComponents: ['SlotForwardCard', 'SlotPositionsPanel', 'TemplateDelimiterBadge'],
  description: 'A named JSX prop holding a nested component, forwarded by the receiving component to a grandchild prop',
  interactions: [
    { type: 'expectText', selector: 'aside span.h em', text: 'badge' },
  ],
}

export const fixture = defineSharedFixture(spec)
