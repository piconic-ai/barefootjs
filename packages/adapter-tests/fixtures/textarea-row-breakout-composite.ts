import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

/**
 * Composite-row twin of `textarea-row-breakout`: the nested `<Tag>` forces
 * `useElementReconciliation`, so row construction goes through
 * `irToPlaceholderTemplate` instead of `irToHtmlTemplate` — the sibling
 * builder a review on #2792 found still unescaped after that PR's fix.
 */

const PAYLOAD = 'a</textarea><b class="broke">X</b>'
const row1 = 'li:nth-child(1) .ta'
const row2 = 'li:nth-child(2) .ta'

export const spec: SharedFixtureSpec = {
  id: 'textarea-row-breakout-composite',
  componentName: 'TextareaRowBreakoutComposite',
  sourceRoot: 'fixture',
  description:
    'A controlled textarea in a composite (nested-child-component) keyed row keeps its full value when the row is rebuilt (#2765)',
  interactions: [
    { type: 'expectValue', selector: row1, value: PAYLOAD },
    { type: 'click', selector: 'button.add' },
    { type: 'expectValue', selector: row2, value: PAYLOAD },
    { type: 'expectHidden', selector: '.broke' },
    { type: 'expectValue', selector: row1, value: PAYLOAD },
  ],
}

export const fixture = defineSharedFixture(spec)
