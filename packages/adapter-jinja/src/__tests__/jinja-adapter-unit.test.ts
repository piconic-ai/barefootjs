/**
 * Ported from the Xslate-specific describes in
 * `packages/adapter-xslate/src/__tests__/xslate-adapter.test.ts` (lines
 * 152-400): SSR context propagation, memo seeding, signal seeding +
 * data-key, #1966 @client attribute deferral, #2073 map_eval, #2018 P2
 * predicate lowering. Expected template strings are translated to Jinja
 * syntax. `runAdapterConformanceTests` itself (lines 24-150) and
 * `src/test-render.ts` are workstream C and are NOT ported here.
 *
 * One describe (`prop-derived signal SSR seeding + data-key`) diverges
 * behaviourally, not just syntactically: the "does NOT in-template-seed a
 * same-name signal" Xslate test is inverted here to "DOES seed" — see
 * `memo/seed.ts`'s file header for why Jinja's `{% set %}` doesn't have
 * Kolon's `my`-shadowing hazard.
 */

import { describe, test, expect } from 'bun:test'
import { JinjaAdapter } from '../adapter'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

// =============================================================================
// Helpers
// =============================================================================

function compileToIR(source: string): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: new JinjaAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string) {
  return new JinjaAdapter().generate(compileToIR(source))
}

// =============================================================================
// Jinja-Specific Tests
// =============================================================================

describe('JinjaAdapter - SSR context propagation (#1297)', () => {
  // `<Ctx.Provider value>` brackets its children with inline provide/revoke
  // calls (both return '' so the `{{ … }}` interpolation discards them);
  // descendant `useContext` consumers read the value during the same
  // render.
  test('provider brackets children with provide_context / revoke_context', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createContext, useContext } from '@barefootjs/client'
const ThemeContext = createContext('light')
export function ThemeRoot() {
  return <div><ThemeContext.Provider value="dark"><ThemeLabel /></ThemeContext.Provider></div>
}
function ThemeLabel() { const theme = useContext(ThemeContext); return <span>{theme}</span> }
`)
    expect(template).toContain("bf.provide_context('ThemeContext', 'dark')")
    expect(template).toContain("bf.revoke_context('ThemeContext')")
    expect(template.indexOf('provide_context')).toBeLessThan(template.indexOf('render_child'))
    expect(template.indexOf('render_child')).toBeLessThan(template.indexOf('revoke_context'))
  })

  test('consumer seeds its local from use_context with the createContext default', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createContext, useContext } from '@barefootjs/client'
const ThemeContext = createContext('light')
export function ThemeLabel() { const theme = useContext(ThemeContext); return <span>{theme}</span> }
`)
    expect(template).toContain("{% set theme = bf.use_context('ThemeContext', 'light') %}")
  })
})

describe('JinjaAdapter - prop-derived memo SSR seeding (#1297)', () => {
  // A memo whose body can't be statically folded (`props.value * 10`) gets a
  // `null` SSR default; the adapter computes it in-template from the seeded
  // prop var so the child renders the value instead of empty.
  test('seeds a prop-derived memo from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function Child(props: { value: number }) {
  const displayValue = createMemo(() => props.value * 10)
  return <span>{displayValue()}</span>
}
`)
    expect(template).toContain('{% set displayValue = value * 10 %}')
  })

  test('seeds a memo over a destructured prop', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function Child({ value }: { value: number }) {
  const displayValue = createMemo(() => value * 10)
  return <span>{displayValue()}</span>
}
`)
    expect(template).toContain('{% set displayValue = value * 10 %}')
  })
})

describe('JinjaAdapter - prop-derived signal SSR seeding + data-key (#1297, toggle-shared)', () => {
  test('seeds a prop-derived (different-name) signal from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Item(props: { defaultOn?: boolean }) {
  const [on, setOn] = createSignal(props.defaultOn ?? false)
  return <button>{on() ? 'ON' : 'OFF'}</button>
}
`)
    expect(template).toContain('{% set on = (defaultOn if defaultOn is not none else false) %}')
  })

  // Divergence from the Kolon port: Jinja's `{% set x = x + 1 %}` safely
  // resolves the right-hand `x` from the enclosing scope (no `my`-shadowing
  // hazard), so a same-name signal IS seeded in-template here — strictly
  // more correct than leaving it on the static default. See
  // `memo/seed.ts`'s file header.
  test('DOES in-template-seed a same-name signal (no Kolon `my`-shadow hazard in Jinja)', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { x?: number }) {
  const [x, setX] = createSignal(props.x ?? 7)
  return <span>{x()}</span>
}
`)
    expect(template).toContain('{% set x = (x if x is not none else 7) %}')
  })

  test('emits data_key_attr on the component root', () => {
    const { template } = compileAndGenerate(`
export function Item() { return <div class="x">hi</div> }
`)
    expect(template).toContain('bf.data_key_attr()')
  })

  test('emits data_key_attr on each branch root of an if-statement root', () => {
    const { template } = compileAndGenerate(`
export function Item({ on }: { on?: boolean }) {
  if (on) return <div class="a">A</div>
  return <div class="b">B</div>
}
`)
    const count = (template.match(/bf\.data_key_attr\(\)/g) ?? []).length
    expect(count).toBe(2)
  })
})

// =============================================================================
// #1966 — `/* @client */` defers ATTRIBUTE bindings (not just child/text)
// =============================================================================
//
// `renderAttributes` skips SSR emission for `attr.clientOnly`, so a
// deferred attribute predicate is omitted from the Jinja template (and the
// unsupported-expression lowering is never reached → no BF101/BF102). The
// client runtime sets the attribute on hydrate. Mirrors the Go / Xslate pins.
describe('JinjaAdapter - #1966 @client defers attribute bindings', () => {
  function compileAttr(attrExpr: string) {
    const adapter = new JinjaAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [sel] = createSignal(0)
  const pred = (n: number) => sel() === n
  return <div data-x={${attrExpr}}>hi</div>
}
`)
    const template = adapter.generate(ir).template ?? ''
    const errors = (adapter as unknown as { errors: { code: string }[] }).errors ?? []
    return { errors, template }
  }

  test('bare emits data-x; @client omits it from SSR', () => {
    expect(compileAttr('pred(1)').template).toContain('data-x')
    const deferred = compileAttr('/* @client */ pred(1)')
    expect(deferred.errors).toEqual([])
    expect(deferred.template).not.toContain('data-x')
  })
})

// #2018 P2: higher-order predicates lower through the runtime evaluator
// (`bf.*_eval`), isomorphic with the Go / Xslate `*_eval` helpers. Jinja has
// no lambda fallback (divergence 3 in `jinja-adapter.ts`'s header) — a
// predicate the evaluator can't model surfaces BF101 instead.
describe('JinjaAdapter - #2073 value-producing .map(cb)', () => {
  // The blog-showcase shape (#1938/#1939): a value-returning `.map` (string
  // projection, not JSX) lowers through the evaluator — `bf.map_eval`
  // projects each element (no flatten) and composes through `bf.join`.
  test('.map(t => `#${t}`).join(" ") emits bf.map_eval composed into bf.join', () => {
    const { template } = compileAndGenerate(`
function TagLine({ tags }: { tags: string[] }) {
  return <p>{tags.map((t) => \`#\${t}\`).join(' ')}</p>
}
export { TagLine }
`)
    expect(template).toContain("bf.join(bf.map_eval(tags,")
    expect(template).toContain('"kind":"template-literal"')
  })

  test('.map(u => u.name) emits bf.map_eval with the field projection', () => {
    const { template } = compileAndGenerate(`
function NameList({ users }: { users: { name: string }[] }) {
  return <div>{users.map((u) => u.name).join(', ')}</div>
}
export { NameList }
`)
    expect(template).toContain('bf.map_eval(users,')
    expect(template).toContain('"property":"name"')
  })
})

describe('JinjaAdapter - higher-order predicate lowering (#2018 P2)', () => {
  test('a serializable predicate lowers to bf.filter_eval with the JSON body + env', () => {
    // A standalone `.filter().length` exercises the higher-order emitter (the
    // `.filter().map()` form is a loop-hoist with an inline `{% if %}`,
    // handled by renderLoop, not this emitter).
    const { template } = compileAndGenerate(`
function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.filter(x => x.done).length}</div>
}
export { A }
`)
    expect(template).toContain('bf.filter_eval(')
    expect(template).toContain('"property":"done"')
    expect(template).toContain("'x'")
  })

  test('.find / .findLast share bf.find_eval, distinguished by the forward flag', () => {
    const find = compileAndGenerate(`
function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.find(x => x.done) ? 'y' : 'n'}</div>
}
export { A }
`).template
    expect(find).toContain('bf.find_eval(')
    // `forward` is a genuine Python bool literal here (`true`/`false`),
    // unlike the Kolon port's Perl `1`/`0` — see `expr/array-method.ts`.
    expect(find).toContain(", true, {})")

    const findLast = compileAndGenerate(`
function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.findLast(x => x.done) ? 'y' : 'n'}</div>
}
export { A }
`).template
    expect(findLast).toContain('bf.find_eval(')
    expect(findLast).toContain(", false, {})")
  })

  // Divergence 3 (`jinja-adapter.ts`'s header): Jinja has no lambda
  // expression, so a predicate the evaluator can't serialize (a nested
  // method-call predicate) has NO fallback — unlike Kolon, which falls back
  // to a `-> $x { … }` lambda passed to `$bf.every`. This surfaces BF101
  // instead.
  test('a method-call predicate has no lambda fallback — surfaces BF101', () => {
    const adapter = new JinjaAdapter()
    const ir = compileToIR(`
function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.includes('a')) ? 'y' : 'n'}</div>
}
export { A }
`)
    const { template } = adapter.generate(ir)
    const errors = (adapter as unknown as { errors: { code: string; message: string }[] }).errors
    expect(errors.some(e => e.code === 'BF101' && e.message.includes("'.every(...)'"))).toBe(true)
    // No evaluator helper, and — critically — no lambda syntax either;
    // the condition falls back to the safe `bf.truthy('')` empty-string
    // sentinel (see `convertExpressionToJinja`'s BF101 path).
    expect(template).not.toContain('every_eval')
    expect(template).not.toContain('bf.every(')
    expect(template).toContain("bf.truthy('')")
  })
})

// #2038 nested-callback-predicate loudness is pinned at the shared
// conformance layer (workstream C): `filter-nested-callback-predicate` /
// `filter-nested-find-predicate` (BF101 via `expectedDiagnostics`) and
// `filter-nested-callback-predicate-client` (the `/* @client */` suppression
// twin, which must render clean).
