import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'conditional-sibling-roots',
  componentName: 'ConditionalSiblingRoots',
  sourceRoot: 'fixture',
  description: 'A conditional replaces all same-tag fragment siblings when switching to one element and back',
  interactions: [
    { type: 'expectText', selector: 'section', text: 'AB' },
    { type: 'click', selector: 'button' },
    { type: 'expectText', selector: 'section', text: 'C' },
    { type: 'click', selector: 'button' },
    { type: 'expectText', selector: 'section', text: 'AB' },
  ],
}

export const fixture = defineSharedFixture(spec)
