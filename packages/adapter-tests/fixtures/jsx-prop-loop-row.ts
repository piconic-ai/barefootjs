import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

const objRow = (key: string) => `${key}footx < yfootfoot`
const destructuredRow = 'footfootx < y'

export const spec: SharedFixtureSpec = {
  id: 'jsx-prop-loop-row',
  componentName: 'JsxPropLoopRow',
  sourceRoot: 'fixture',
  additionalComponents: ['SlotLoopList', 'SlotLoopListDestructured', 'SlotLoopNested'],
  description: 'A named JSX prop read inside a loop row (bare, in a ternary and an `&&`, through a destructure rename and a const alias) renders its element once per row, at first paint and in a row the client adds; in a nested loop row, a static-array row and a row conditional; a string prop read beside it stays escaped text, and a row param that shadows a prop name reads the row',
  interactions: [
    { type: 'expectText', selector: 'div.obj li[data-key="a"]', text: objRow('a') },
    { type: 'expectText', selector: 'div.obj li[data-key="b"] span.tern', text: 'foot' },
    { type: 'expectText', selector: 'div.destructured li[data-key="a"]:not(.shadow)', text: destructuredRow },
    { type: 'click', selector: 'button.add-obj' },
    { type: 'expectText', selector: 'div.obj li[data-key="c"]', text: objRow('c') },
    { type: 'expectText', selector: 'div.obj li[data-key="c"] span.and b.f', text: 'foot' },
    { type: 'expectText', selector: 'div.obj li[data-key="a"]', text: objRow('a') },
    { type: 'click', selector: 'button.add-destructured' },
    { type: 'expectText', selector: 'div.destructured li[data-key="c"]:not(.shadow)', text: destructuredRow },
    { type: 'expectText', selector: 'div.destructured li[data-key="c"] i b.f', text: 'foot' },
    { type: 'expectText', selector: 'div.destructured li.shadow[data-key="c"]', text: 'c' },
    { type: 'expectText', selector: 'div.nested section[data-key="g1"] p', text: 'afoot' },
    { type: 'expectText', selector: 'div.nested ul.static li[data-key="y"]', text: 'yfoot' },
    { type: 'click', selector: 'button.add-nested' },
    { type: 'expectText', selector: 'div.nested section[data-key="g2"] p', text: 'bfoot' },
    { type: 'expectText', selector: 'div.nested section[data-key="g2"] em', text: 'foot' },
    { type: 'click', selector: 'button.toggle-nested' },
    { type: 'expectText', selector: 'div.nested section[data-key="g1"] u', text: 'off' },
    { type: 'click', selector: 'button.toggle-nested' },
    { type: 'expectText', selector: 'div.nested section[data-key="g1"] em b.f', text: 'foot' },
  ],
}

export const fixture = defineSharedFixture(spec)
