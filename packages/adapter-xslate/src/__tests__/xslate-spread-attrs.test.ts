/**
 * XslateAdapter — conditional-spread / nullish-omission / hyphenated-key
 * regression tests (#textarea / #checkbox Phase 2b parity).
 *
 * Mirrors the Mojo adapter's same-named suites
 * (`packages/adapter-mojolicious/src/__tests__/mojo-adapter.test.ts`), pinning
 * the Kolon form of each ported shape. The shared adapter-conformance fixtures
 * (`textarea`, `checkbox`) only exercise the falsy branch of the conditional
 * spread and the unset branch of the optional attr, so these unit tests pin the
 * truthy / present branches the fixtures can't reach.
 */

import { test, expect, describe } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { XslateAdapter } from '../adapter'

function compileToIR(source: string, adapter?: XslateAdapter): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new XslateAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string, adapter?: XslateAdapter) {
  const a = adapter ?? new XslateAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

describe('XslateAdapter - conditional inline-object spread (textarea aria-describedby)', () => {
  // `{...(cond ? { 'aria-describedby': cond } : {})}` lowers to a Kolon inline
  // ternary of hashrefs so the falsy `{}` branch OMITS the key
  // ($bf.spread_attrs does not emit empty entries). The shared fixture only
  // exercises the falsy branch; this pins the truthy one.
  test('emits a Kolon inline ternary of hashrefs through $bf.spread_attrs', () => {
    const { template } = compileAndGenerate(`
function Box({ describedBy }: { describedBy?: string }) {
  return <div {...(describedBy ? { 'aria-describedby': describedBy } : {})} />
}
`)
    expect(template).toContain(
      "$bf.spread_attrs($describedBy ? { 'aria-describedby' => $describedBy } : {})",
    )
  })

  test('resolves the value reference and preserves the static key for a second prop', () => {
    const { template } = compileAndGenerate(`
function Box({ label }: { label: string }) {
  return <div {...(label ? { 'data-label': label } : {})} />
}
`)
    expect(template).toContain(
      "$bf.spread_attrs($label ? { 'data-label' => $label } : {})",
    )
  })

  test('falls back to BF101 for a computed (non-static) object key', () => {
    const adapter = new XslateAdapter()
    const ir = compileToIR(`
function Box({ k, v }: { k?: string; v?: string }) {
  return <div {...(v ? { [k]: v } : {})} />
}
`, adapter)
    adapter.generate(ir)
    const errs = (adapter as unknown as { errors: { code: string }[] }).errors
    expect(errs.some(e => e.code === 'BF101')).toBe(true)
  })
})

describe('XslateAdapter - local-const conditional-spread resolution (#checkbox icon)', () => {
  // A FUNCTION-scope const holding a `cond ? {…} : {}` ternary, spread as a bare
  // identifier (`{...attrs}`), resolves through the same Kolon
  // ternary-of-hashrefs lowering as the inline form. CheckIcon's
  // `const sizeAttrs = size ? {…} : {}` is exactly this shape.
  test('resolves a bare-identifier spread of a function-scope conditional const', () => {
    const { template } = compileAndGenerate(`
function Box({ flag }: { flag?: boolean }) {
  const attrs = flag ? { 'data-on': 'yes' } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain(
      "$bf.spread_attrs($flag ? { 'data-on' => 'yes' } : {})",
    )
  })

  // A const that aliases another bare identifier must NOT be forwarded (loop
  // guard): the resolver bails, so the spread falls through to the standard
  // lowering emitting the bare `$attrs` variable.
  test('does not forward a const that aliases another identifier (loop guard)', () => {
    const { template } = compileAndGenerate(`
function Box({ other }: { other?: object }) {
  const attrs = other
  return <div {...attrs} />
}
`)
    expect(template).toContain('$bf.spread_attrs($attrs)')
  })
})

describe('XslateAdapter - Record<staticKeys,scalar>[propKey] spread value (#checkbox icon)', () => {
  // `const sizeMap: Record<IconSize, number> = { sm: 16, ... }` indexed by a
  // prop inside a conditional-spread object value lowers to an inline indexed
  // Kolon hashref `{ ... }[$key]` (bracket index — Kolon rejects Perl's
  // `->{$key}` arrow-deref). This is CheckIcon's
  // `{ width: sizeMap[size], height: sizeMap[size] }` shape.
  test('lowers an indexed module-const map to an inline bracket-indexed hashref', () => {
    const { template } = compileAndGenerate(`
const sizeMap: Record<string, number> = { sm: 16, md: 20, lg: 24, xl: 32 }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain(
      "{ 'sm' => 16, 'md' => 20, 'lg' => 24, 'xl' => 32 }[$size]",
    )
    // Must NOT emit the Perl arrow-deref form (Kolon rejects it).
    expect(template).not.toContain('->{$size}')
  })

  test('lowers string-valued record maps too', () => {
    const { template } = compileAndGenerate(`
const labelMap: Record<string, string> = { a: 'Alpha', b: 'Beta' }
function Box({ k }: { k?: string }) {
  const attrs = k ? { 'data-label': labelMap[k] } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain("{ 'a' => 'Alpha', 'b' => 'Beta' }[$k]")
  })

  // A non-scalar record value (object) is out of shape: the spread object value
  // can't lower, so the whole spread falls back to BF101.
  test('refuses a non-scalar record value with BF101 (out-of-shape fallback)', () => {
    const adapter = new XslateAdapter()
    const ir = compileToIR(`
const sizeMap: Record<string, object> = { sm: { w: 1 } }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`, adapter)
    adapter.generate(ir)
    const errs = (adapter as unknown as { errors: { code: string }[] }).errors
    expect(errs.some(e => e.code === 'BF101')).toBe(true)
  })
})

describe('XslateAdapter - props-object inherited-attribute enumeration (#checkbox)', () => {
  // A SolidJS props-object component reads inherited attributes (`props.id`)
  // not enumerated in `propsParams`. The bare optional attribute must be guarded
  // with Kolon `defined` so it's omitted when unset (Hono parity), even though
  // `id` isn't a declared param.
  test('guards a props-object bare optional attr (props.id) with defined', () => {
    const { template } = compileAndGenerate(`
"use client"
interface P { tone?: string }
export function Widget(props: P) {
  return <button id={props.id}>x</button>
}
`)
    expect(template).toContain(': if (defined $id) {')
    expect(template).toContain('id="<: $id :>"')
  })
})

describe('XslateAdapter - hyphenated child attr hash key (#checkbox)', () => {
  // A child component prop whose JSX name isn't a bare Kolon identifier
  // (`<CheckIcon data-slot="..."/>`) must be quoted in the `render_child`
  // hashref — an unquoted `data-slot => ...` parses as `data - slot`.
  test('quotes a hyphenated child attribute name in render_child', () => {
    const { template } = compileAndGenerate(`
"use client"
import { Leaf } from './leaf'
export function Host() {
  return <div><Leaf data-slot="indicator" size="sm" /></div>
}
`)
    expect(template).toContain("'data-slot' => 'indicator'")
    // A bare-identifier name stays unquoted.
    expect(template).toContain('size => ')
    expect(template).not.toContain('data-slot => ')
  })
})

describe('XslateAdapter - nullish optional-attribute omission (textarea rows)', () => {
  // A no-destructure-default, nillable-typed prop is `undef` when the caller
  // omits it; guard its bare-reference attribute with Kolon `defined` so it
  // DROPS instead of rendering `attr=""` — matching Hono's nullish-attribute
  // omission. Concrete/defaulted props are never `undef` and stay
  // unconditional.
  test('guards a no-default nillable attr with a Kolon defined check', () => {
    const { template } = compileAndGenerate(`
function C({ rows }: { rows?: number }) {
  return <textarea rows={rows} />
}
`)
    expect(template).toContain(': if (defined $rows) {')
    expect(template).toContain('rows="<: $rows :>"')
  })

  test('leaves a defaulted attr unconditional (scope did not widen)', () => {
    const { template } = compileAndGenerate(`
function C({ value = '' }: { value?: string }) {
  return <textarea value={value} />
}
`)
    // `value` has a destructure default → never undef → unconditional, exactly
    // like Hono's value="".
    expect(template).toContain('value="<: $value :>"')
    expect(template).not.toContain('defined $value')
  })
})
