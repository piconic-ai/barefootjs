/**
 * Regression for the review finding on #2524's SSR half (BLOCKER 1): a
 * reserved-word aliased/defaulted prop passed to a CHILD component used to
 * be silently clobbered by the child's static default.
 *
 * `child_props` arrives at `_derive_stash_from_defaults` already
 * keyword-mangled (`jinja_ident`, `runtime.py`) — `as` becomes `as_` — but
 * the serialised `_defaults` map's own keys and each entry's `propName` were
 * the RAW (un-mangled) spellings `extractSsrDefaults` emits. For a
 * reserved-word prop, `_derive_stash_from_defaults` looked up `props['as']`
 * (never present — the real key is `as_`), missed, and fell back to the
 * static default under the RAW key `as`; after `_vars = {**child_props,
 * **_extra}`, the WRONG static default won over the real caller value.
 *
 * `_derive_stash_from_defaults` now mangles both the output key and the
 * `propName` lookup (mirrors the Rust runtime's `resolve_child_vars`), so
 * this resolves correctly. See `runtime.py`'s `_derive_stash_from_defaults`
 * docstring.
 */
import { test, expect } from 'bun:test'
import { JinjaAdapter } from '../adapter'
import { renderJinjaComponent, PythonNotAvailableError } from '../test-render'

const SOURCE = `
import { Tag } from './Tag'
export function Wrapper() {
  return <Tag as="section" label="hi" />
}
`

const TAG_SOURCE = `
export function Tag({ as = 'span', label }: { as?: string; label: string }) {
  return <div>{as}:{label}</div>
}
`

test('a reserved-word aliased/defaulted prop survives the child-render path (jinja, #2524 follow-up)', async () => {
  let html: string
  try {
    html = await renderJinjaComponent({
      source: SOURCE,
      adapter: new JinjaAdapter(),
      components: { './Tag': TAG_SOURCE },
    })
  } catch (err) {
    if (err instanceof PythonNotAvailableError) {
      console.log(`Skipping: ${err.message}`)
      return
    }
    throw err
  }
  // The caller passed `as="section"` — it must win over the child's own
  // `as = 'span'` destructure default. Text is wrapped in bf slot markers,
  // so match each interpolated value rather than the literal `x:y` shape.
  expect(html).toContain('>section<')
  expect(html).toContain('>hi<')
  expect(html).not.toContain('>span<')
})
