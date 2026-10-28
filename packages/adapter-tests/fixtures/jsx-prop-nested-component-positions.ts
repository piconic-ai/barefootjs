import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'jsx-prop-nested-component-positions',
  componentName: 'JsxPropNestedComponentPositions',
  sourceRoot: 'fixture',
  additionalComponents: ['SlotPositionsCard', 'TemplateDelimiterBadge'],
  description: 'A named JSX prop holding a nested component, read in text position by a destructuring child, keeps its markup through hydration and a sibling signal update',
  interactions: [
    { type: 'expectText', selector: 'header span.h em', text: 'badge' },
    { type: 'click', selector: 'div.body button' },
    { type: 'expectText', selector: 'div.body button', text: '1' },
    { type: 'expectText', selector: 'header span.h em', text: 'badge' },
  ],
}

export const fixture = defineSharedFixture(spec)
