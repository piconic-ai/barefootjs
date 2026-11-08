import { createFixture } from '../src/types'

/**
 * An explicit attribute (`tone={r.tone}`) always passes its key, even when
 * the row omits the field: the child then holds `undefined`, and a later
 * `{...props}` spread in that child carries the key on, overriding the
 * literal written before it (`<Leaf tone="first" {...props} />`). Only a
 * key the caller left out entirely keeps the literal.
 */
export const fixture = createFixture({
  id: 'explicit-row-field-prop-stays-present',
  description: "An explicit attribute reading a row's omitted optional field passes undefined, which a later props spread carries over an earlier literal",
  source: `
function Leaf(props: { tone?: string }) {
  return <b>{String(props.tone)}</b>
}

function Relay(props: { tone?: string }) {
  return <span><Leaf tone="first" {...props} /></span>
}

type Row = { id: string; tone?: string }

export function ExplicitRowFieldPropStaysPresent({ rows }: { rows: Row[] }) {
  return (
    <div>
      {rows.map(r => <Relay key={r.id} tone={r.tone} />)}
      <Relay />
    </div>
  )
}
`,
  props: { rows: [{ id: 'a' }, { id: 'b', tone: 'set' }, { id: 'c', tone: null }] },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <span bf-s="Relay_*" data-key="a"><b bf-s="Relay_*_s0" bf="s1"><!--bf:s0-->undefined<!--/--></b></span>
      <span bf-s="Relay_*" data-key="b"><b bf-s="Relay_*_s0" bf="s1"><!--bf:s0-->set<!--/--></b></span>
      <span bf-s="Relay_*" data-key="c"><b bf-s="Relay_*_s0" bf="s1"><!--bf:s0-->null<!--/--></b></span>
      <span bf-s="test_s1"><b bf-s="test_s1_s0" bf="s1"><!--bf:s0-->first<!--/--></b></span>
    </div>
  `,
})
