import { createFixture } from '../src/types'

/**
 * The catalogued object type (#2277) as a data-point prop: `cfg: { id:
 * number; label?: string }`, one required and one optional field, both
 * rendered in text position. Uses `props: Type` (not destructured) for the
 * same reason `union-catalogued.ts` does — the full object `TypeInfo`
 * (with `.properties`) only resolves down the props-object path;
 * `collectMemberTypes` degrades a destructured object-typed member to
 * `unknown`.
 *
 * `cfg` is required, so the type-derived catalogue
 * (`adversarial-catalog.ts`) contributes:
 * - `gen:cfg:object:minimal` — `{ id: 0 }`, `label` omitted (required
 *   fields only);
 * - `gen:cfg:object:+label` — `{ id: 0, label: '' }`, the optional
 *   field's "present" variant.
 */
export const fixture = createFixture({
  id: 'object-catalogued',
  description: 'Object-typed prop ({ id: number; label?: string }) rendering its fields',
  source: `
function ConfigObject(props: { cfg: { id: number; label?: string } }) {
  return (
    <div>
      <span>{props.cfg.id}</span>
      <span>{props.cfg.label}</span>
    </div>
  )
}
export { ConfigObject }
`,
  props: { cfg: { id: 1, label: 'x' } },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->1<!--/--></span>
      <span bf="s3"><!--bf:s2-->x<!--/--></span>
    </div>
  `,
})
