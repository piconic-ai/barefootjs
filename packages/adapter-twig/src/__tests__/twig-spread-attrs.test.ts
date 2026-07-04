/**
 * TwigAdapter — conditional-spread / nullish-omission / hyphenated-key
 * regression tests (#textarea / #checkbox Phase 2b parity).
 *
 * Ported from `packages/adapter-jinja/src/__tests__/jinja-spread-attrs.test.ts`,
 * translating each expected template string to Twig syntax. The shared
 * adapter-conformance fixtures (`textarea`, `checkbox`) only exercise the
 * falsy branch of the conditional spread and the unset branch of the
 * optional attr, so these unit tests pin the truthy / present branches the
 * fixtures can't reach.
 *
 * Two translation notes beyond the mechanical Jinja→Twig ternary swap
 * (`(a if cond else b)` → `(cond ? a : b)`, per the design doc's syntax
 * table):
 *
 * 1. Hash-literal keys are ALWAYS quoted in Twig too (`twigHashKey`
 *    unconditionally single-quotes, same rule as `jinjaHashKey` and for the
 *    same reason — `{key: value}` means "look up the *variable* `key`", not
 *    the string `"key"`), so there is no "stays unquoted" case to assert for
 *    a bare-identifier-safe prop name like `size`; only that BOTH keys are
 *    correctly quoted (same note as the Jinja port's file header).
 * 2. The Jinja port's `is defined and is not none` null-guard on an
 *    `{% if %}` test becomes Twig's `is defined and is not null` — Twig's
 *    null test is spelled `null` (aliased `none`); this port uses the
 *    canonical `null` spelling to match the design doc's null-literal
 *    mapping (`none` → `null`).
 */

import { test, expect, describe } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { TwigAdapter } from '../adapter'

function compileToIR(source: string, adapter?: TwigAdapter): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new TwigAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string, adapter?: TwigAdapter) {
  const a = adapter ?? new TwigAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

describe('TwigAdapter - conditional inline-object spread (textarea aria-describedby)', () => {
  // `{...(cond ? { 'aria-describedby': cond } : {})}` lowers to a Twig inline
  // ternary of dicts so the falsy `{}` branch OMITS the key
  // (bf.spread_attrs does not emit empty entries). The shared fixture only
  // exercises the falsy branch; this pins the truthy one.
  test('emits a Twig inline ternary of dicts through bf.spread_attrs', () => {
    const { template } = compileAndGenerate(`
function Box({ describedBy }: { describedBy?: string }) {
  return <div {...(describedBy ? { 'aria-describedby': describedBy } : {})} />
}
`)
    expect(template).toContain(
      "bf.spread_attrs((bf.truthy(describedBy) ? {'aria-describedby': describedBy} : {}))",
    )
  })

  test('resolves the value reference and preserves the static key for a second prop', () => {
    const { template } = compileAndGenerate(`
function Box({ label }: { label: string }) {
  return <div {...(label ? { 'data-label': label } : {})} />
}
`)
    expect(template).toContain(
      "bf.spread_attrs((bf.truthy(label) ? {'data-label': label} : {}))",
    )
  })

  test('falls back to BF101 for a computed (non-static) object key', () => {
    const adapter = new TwigAdapter()
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

describe('TwigAdapter - local-const conditional-spread resolution (#checkbox icon)', () => {
  // A FUNCTION-scope const holding a `cond ? {…} : {}` ternary, spread as a bare
  // identifier (`{...attrs}`), resolves through the same Twig
  // ternary-of-dicts lowering as the inline form. CheckIcon's
  // `const sizeAttrs = size ? {…} : {}` is exactly this shape.
  test('resolves a bare-identifier spread of a function-scope conditional const', () => {
    const { template } = compileAndGenerate(`
function Box({ flag }: { flag?: boolean }) {
  const attrs = flag ? { 'data-on': 'yes' } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain(
      "bf.spread_attrs((bf.truthy(flag) ? {'data-on': 'yes'} : {}))",
    )
  })

  // A const that aliases another bare identifier must NOT be forwarded (loop
  // guard): the resolver bails, so the spread falls through to the standard
  // lowering emitting the bare `attrs` variable.
  test('does not forward a const that aliases another identifier (loop guard)', () => {
    const { template } = compileAndGenerate(`
function Box({ other }: { other?: object }) {
  const attrs = other
  return <div {...attrs} />
}
`)
    expect(template).toContain('bf.spread_attrs(attrs)')
  })
})

describe('TwigAdapter - Record<staticKeys,scalar>[propKey] spread value (#checkbox icon)', () => {
  // `const sizeMap: Record<IconSize, number> = { sm: 16, ... }` indexed by a
  // prop inside a conditional-spread object value lowers to an inline
  // bracket-indexed Twig dict `{...}[key]` — the SAME bracket-index syntax
  // JS itself uses (unlike Kolon, which had to steer around Perl's
  // arrow-deref `->{$key}` to the bracket form). This is CheckIcon's
  // `{ width: sizeMap[size], height: sizeMap[size] }` shape.
  test('lowers an indexed module-const map to an inline bracket-indexed dict', () => {
    const { template } = compileAndGenerate(`
const sizeMap: Record<string, number> = { sm: 16, md: 20, lg: 24, xl: 32 }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain(
      "{'sm': 16, 'md': 20, 'lg': 24, 'xl': 32}[size]",
    )
  })

  test('lowers string-valued record maps too', () => {
    const { template } = compileAndGenerate(`
const labelMap: Record<string, string> = { a: 'Alpha', b: 'Beta' }
function Box({ k }: { k?: string }) {
  const attrs = k ? { 'data-label': labelMap[k] } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain("{'a': 'Alpha', 'b': 'Beta'}[k]")
  })

  // A non-scalar record value (object) is out of shape: the spread object value
  // can't lower, so the whole spread falls back to BF101.
  test('refuses a non-scalar record value with BF101 (out-of-shape fallback)', () => {
    const adapter = new TwigAdapter()
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

describe('TwigAdapter - props-object inherited-attribute enumeration (#checkbox)', () => {
  // A SolidJS props-object component reads inherited attributes (`props.id`)
  // not enumerated in `propsParams`. The bare optional attribute must be
  // guarded so it's omitted when unset (Hono parity), even though `id`
  // isn't a declared param.
  test('guards a props-object bare optional attr (props.id) with is defined and is not null', () => {
    const { template } = compileAndGenerate(`
"use client"
interface P { tone?: string }
export function Widget(props: P) {
  return <button id={props.id}>x</button>
}
`)
    expect(template).toContain('{% if id is defined and id is not null %}')
    expect(template).toContain('id="{{ bf.string(id) }}"')
  })
})

describe('TwigAdapter - hyphenated child attr dict key (#checkbox)', () => {
  // A child component prop whose JSX name isn't a bare identifier
  // (`<CheckIcon data-slot="..."/>`) must be quoted in the `render_child`
  // dict — same as EVERY other key, since Twig dict-literal keys are
  // ALWAYS quoted (see the file header for why this diverges from the
  // Kolon port's "only quote when non-bareword-safe" assertion).
  test('quotes every child attribute name in render_child, hyphenated or not', () => {
    const { template } = compileAndGenerate(`
"use client"
import { Leaf } from './leaf'
export function Host() {
  return <div><Leaf data-slot="indicator" size="sm" /></div>
}
`)
    expect(template).toContain("'data-slot': 'indicator'")
    expect(template).toContain("'size': 'sm'")
  })
})

describe('TwigAdapter - nullish optional-attribute omission (textarea rows)', () => {
  // A no-destructure-default, nillable-typed prop is `null` when the caller
  // omits it; guard its bare-reference attribute with a Twig
  // "is defined and is not null" test so it DROPS instead of rendering
  // `attr=""` — matching Hono's nullish-attribute omission. Concrete/defaulted
  // props are never `null` and stay unconditional.
  test('guards a no-default nillable attr with a Twig defined+not-null check', () => {
    const { template } = compileAndGenerate(`
function C({ rows }: { rows?: number }) {
  return <textarea rows={rows} />
}
`)
    expect(template).toContain('{% if rows is defined and rows is not null %}')
    expect(template).toContain('rows="{{ bf.string(rows) }}"')
  })

  test('leaves a defaulted attr unconditional (scope did not widen)', () => {
    const { template } = compileAndGenerate(`
function C({ value = '' }: { value?: string }) {
  return <textarea value={value} />
}
`)
    // `value` has a destructure default → never null → unconditional, exactly
    // like Hono's value="".
    expect(template).toContain('value="{{ bf.string(value) }}"')
    expect(template).not.toContain('is not null')
  })
})
