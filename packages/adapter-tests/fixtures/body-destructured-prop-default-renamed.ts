import { createFixture } from '../src/types'

/**
 * A RENAMED body-destructured prop WITH a default (`const { label: text =
 * 'none' } = props`), rendered into an attribute — #2943.
 *
 * The twin of `body-destructured-props-live` (the UNRENAMED default,
 * `const { label = 'none' } = props`) and of `children-passthrough-renamed`
 * (a RENAME with no default). Neither existing fixture alone exercised
 * BOTH at once: before #2943, `extractPropsFromTypeMembers` built
 * `propsParams` purely from the TYPE annotation, with no notion of a body
 * destructure's own default — so `text` got no `propsParams` entry at all.
 * Every non-Hono template adapter's presence-guard classification and
 * `extractSsrDefaults`'s SSR stash then had nothing to seed `text` from:
 * Jinja/Mojo/etc. read the undefined local `text`/`$text` UNCONDITIONALLY
 * (no default fallback anywhere), and Go's Input struct had no `Text`
 * field mapping at all — a `go run` compile error, not a soft divergence.
 *
 * Fixed: the analyzer now overlays the default onto a SECOND `propsParams`
 * entry (`text`, `sourceName: 'label'`) alongside the original `label`
 * entry, so `text` is seeded and classified exactly like a parameter-
 * destructured default (`function Foo({ label: text = 'none' })`) would
 * be. `label` itself stays a real, separately-classified binding — this
 * fixture ALSO reads `props.label` directly (in a nullish-guarded
 * attribute) to pin that the rename doesn't clobber or duplicate the
 * original prop's own classification/stash entry.
 *
 * Hono is correct by construction here (it just runs the real JS
 * destructuring default), so `expectedHtml` is generated from it
 * unmodified — this fixture graduates the sibling `renderDivergences`
 * pins that #2943 registered on all 8 non-Hono adapters, it doesn't need
 * its own.
 *
 * Named `RenamedDefaultLabel`, not `Child` — the compiled `init<Name>`
 * function for a component literally named `Child` collides with the CSR
 * conformance harness's own `initChild` shim (`csr-render.ts`), the same
 * class of reserved-identifier collision the earlier `BodyLiveChild`
 * rename (#2934/#2943) fixed for the Go integrations' `LiveChild` clash.
 */
export const fixture = createFixture({
  id: 'body-destructured-prop-default-renamed',
  description: 'A renamed body-destructured prop default renders the default on SSR (#2943)',
  source: `
function RenamedDefaultLabel(props: { value: number; label?: string }) {
  const { value, label: text = 'none' } = props
  return (
    <div data-label={text} data-raw-label={props.label}>
      {value}:{text}
    </div>
  )
}
export { RenamedDefaultLabel }
`,
  props: { value: 1 },
  dataPoints: [
    { name: 'default-applied', props: { value: 1 } },
    { name: 'caller-value-wins', props: { value: 1, label: 'named' } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s2" data-label="none"><!--bf:s0-->1<!--/-->:<!--bf:s1-->none<!--/--></div>
  `,
})
