import type { JSXFixture } from '../src/types'
import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'conditional-nested-loop-static-reactivity',
  componentName: 'ConditionalNestedStatic',
  sourceRoot: 'fixture',
  description: 'Nested branch rows update attributes and text after selection and branch re-entry',
  interactions: [
    { type: 'click', selector: '[data-choice="b2"]' },
    { type: 'expectText', selector: 'output', text: 'b2' },
    { type: 'expectText', selector: '[data-choice="a1"] .value', text: 'b2:a1' },
    { type: 'expectAttribute', selector: '[data-choice="b2"]', attribute: 'aria-checked', value: 'true' },
    { type: 'expectText', selector: '[data-choice="b2"] .status', text: 'on' },
    { type: 'expectAttribute', selector: '[data-choice="a1"]', attribute: 'aria-checked', value: 'false' },
    { type: 'expectText', selector: '[data-choice="a1"] .status', text: 'off' },
    { type: 'click', selector: '#toggle' },
    { type: 'click', selector: '#toggle' },
    { type: 'click', selector: '[data-choice="a2"]' },
    { type: 'expectText', selector: 'output', text: 'a2' },
    { type: 'expectText', selector: '[data-choice="b2"] .value', text: 'a2:b2' },
    { type: 'expectAttribute', selector: '[data-choice="a2"]', attribute: 'aria-checked', value: 'true' },
    { type: 'expectText', selector: '[data-choice="a2"] .status', text: 'on' },
    { type: 'expectText', selector: '[data-choice="b2"] .status', text: 'off' },
  ],
}

export const fixture: JSXFixture = {
  ...defineSharedFixture(spec),
  escapes: [
    { kind: 'client-directive', fixture: 'conditional-nested-loop-client-reactivity' },
    { kind: 'prop-precompute', fixture: 'conditional-nested-loop-precomputed-reactivity' },
  ],
}
