/**
 * Regression for the review finding on #2524's SSR half (BLOCKER 1): a
 * reserved-word aliased/defaulted prop passed to a CHILD component used to
 * be silently clobbered by the child's static default.
 *
 * `$child_props` arrives at `deriveStashFromDefaults` already
 * keyword-mangled (`blade_ident`, `naming.php`) — `loop` becomes `loop_`
 * (Blade's reserved-word set, unlike Twig's, is render-time-PHP-scope
 * collisions, not template-syntax keywords — see `naming.php`'s docstring)
 * — but the serialised `$_defaults` array's own keys and each entry's
 * `propName` were the RAW (un-mangled) spellings `extractSsrDefaults`
 * emits. For a reserved-word prop, `deriveStashFromDefaults` looked up
 * `$props['loop']` (never present — the real key is `loop_`), missed, and
 * fell back to the static default under the RAW key `loop`; after
 * `$_vars = array_merge($child_props, $_extra)`, the WRONG static default
 * won over the real caller value.
 *
 * `deriveStashFromDefaults` now takes the caller's `$backend` and mangles
 * both the output key and the `propName` lookup through the same
 * `Backend::ident()` the caller's `$child_props` were mangled with. See
 * `BarefootJS.php`'s `deriveStashFromDefaults` docstring.
 */
import { test, expect } from 'bun:test'
import { BladeAdapter } from '../adapter'
import { renderBladeComponent, BladeNotAvailableError } from '../test-render'

const SOURCE = `
import { Tag } from './Tag'
export function Wrapper() {
  return <Tag loop="section" label="hi" />
}
`

const TAG_SOURCE = `
export function Tag({ loop = 'span', label }: { loop?: string; label: string }) {
  return <div>{loop}:{label}</div>
}
`

test('a reserved-word aliased/defaulted prop survives the child-render path (blade, #2524 follow-up)', async () => {
  let html: string
  try {
    html = await renderBladeComponent({
      source: SOURCE,
      adapter: new BladeAdapter(),
      components: { './Tag': TAG_SOURCE },
    })
  } catch (err) {
    if (err instanceof BladeNotAvailableError) {
      console.log(`Skipping: ${err.message}`)
      return
    }
    throw err
  }
  // The caller passed `loop="section"` — it must win over the child's own
  // `loop = 'span'` destructure default. Text is wrapped in bf slot
  // markers, so match each interpolated value rather than the literal
  // `x:y` shape.
  expect(html).toContain('>section<')
  expect(html).toContain('>hi<')
  expect(html).not.toContain('>span<')
})
