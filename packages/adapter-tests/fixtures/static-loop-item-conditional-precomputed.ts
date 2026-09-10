import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-loop-item-conditional` — the SECOND
 * escape kind the BF101 diagnostic claims, alongside
 * `static-loop-item-conditional-client`.
 *
 * The base fixture refuses on TWO adapters, for two unrelated reasons:
 *   - Go template (graduated in #2898, no longer refuses).
 *   - Mojolicious / Xslate (#2911): both Perl-backed adapters' own
 *     `staticValueToPerl` deliberately refuses to bake a `boolean` value
 *     anywhere inside a static array's item shape — Perl has no boolean
 *     literal. That refusal keys off the array being a LOCAL CONST
 *     (`this.localConstants`); a PROP-derived array skips compile-time
 *     baking entirely and flows through the adapter's normal runtime
 *     `{{range}}`-equivalent loop, where a boolean field is just ordinary
 *     Perl truthy/falsy data — no literal serialization involved.
 * Moving `items` to a prop escapes both, with full SSR.
 */
export const fixture = createFixture({
  id: 'static-loop-item-conditional-precomputed',
  description: 'prop-precompute twin of static-loop-item-conditional — items moved to a prop, full SSR (#2898, #2911)',
  source: `
type Item = { id: number; label: string; active: boolean; tag: string | null }

export function StaticLoopItemConditionalPrecomputed(props: { items: Item[] }) {
  return (
    <ul>
      {props.items.map(item => (
        <li key={item.id}>
          <span>{item.label}</span>
          {item.active ? <b>on</b> : <i>off</i>}
          {item.tag ? <em>tagged</em> : null}
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, label: 'Alpha', active: true, tag: 'x' },
      { id: 2, label: 'Beta', active: false, tag: null },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li data-key="1">
        <span><!--bf:s0-->Alpha<!--/--></span>
        <b bf-c="s1">on</b>
        <em bf-c="s2">tagged</em>
      </li>
      <li data-key="2">
        <span><!--bf:s0-->Beta<!--/--></span>
        <i bf-c="s1">off</i>
        <!--bf-cond-start:s2-->
        <!--bf-cond-end:s2-->
      </li>
    </ul>
  `,
})
