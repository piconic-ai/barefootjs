/**
 * Ported from the Jinja-specific describes in
 * `packages/adapter-jinja/src/__tests__/jinja-adapter-unit.test.ts` (itself
 * ported from Xslate's): SSR context propagation, memo seeding, signal
 * seeding + data-key, #1966 @client attribute deferral, #2073 map_eval,
 * #2018 P2 predicate lowering, #2075 searchParams()-derived memo seeding.
 * Expected template strings are translated to Twig syntax.
 * `runAdapterConformanceTests` itself and `src/test-render.ts` are
 * workstream C and are NOT ported here (they live in this same package,
 * but as their own files).
 *
 * One divergence from the byte-for-byte port: every `(x if (x is defined
 * and x is not none) else y)` Jinja shape becomes Twig's native `(x ?? y)`
 * — Twig's `??` guards both "undefined" (with `strict_variables: false`,
 * per the design doc) AND `null` in one operator, so the seed lowering
 * (`memo/seed.ts`) doesn't need Jinja's two-test `is defined and is not
 * none` guard at all. See `memo/seed.ts`'s file header.
 *
 * The "in-template self-reference seeding" behaviour is UNCHANGED from
 * Jinja (not inverted back to Kolon's skip): the design doc verified
 * empirically that Twig's `{% set x = x + 1 %}` resolves the right-hand `x`
 * from the enclosing scope before assignment, the same as Jinja — so a
 * same-name signal IS seeded in-template here too.
 */

import { describe, test, expect } from 'bun:test'
import { TwigAdapter } from '../adapter'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

// =============================================================================
// Helpers
// =============================================================================

function compileToIR(source: string): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: new TwigAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string) {
  return new TwigAdapter().generate(compileToIR(source))
}

// =============================================================================
// Twig-Specific Tests
// =============================================================================

describe('TwigAdapter - SSR context propagation (#1297)', () => {
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

describe('TwigAdapter - prop-derived memo SSR seeding (#1297)', () => {
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

describe('TwigAdapter - prop-derived signal SSR seeding + data-key (#1297, toggle-shared)', () => {
  test('seeds a prop-derived (different-name) signal from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Item(props: { defaultOn?: boolean }) {
  const [on, setOn] = createSignal(props.defaultOn ?? false)
  return <button>{on() ? 'ON' : 'OFF'}</button>
}
`)
    expect(template).toContain('{% set on = (defaultOn ?? false) %}')
  })

  // Twig's `{% set x = x + 1 %}` safely resolves the right-hand `x` from the
  // enclosing scope (no shadowing hazard, verified in the design doc), so a
  // same-name signal IS seeded in-template here — strictly more correct
  // than leaving it on the static default. See `memo/seed.ts`'s file header.
  test('DOES in-template-seed a same-name signal (no shadow hazard in Twig)', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { x?: number }) {
  const [x, setX] = createSignal(props.x ?? 7)
  return <span>{x()}</span>
}
`)
    expect(template).toContain('{% set x = (x ?? 7) %}')
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
// deferred attribute predicate is omitted from the Twig template (and the
// unsupported-expression lowering is never reached → no BF101/BF102). The
// client runtime sets the attribute on hydrate. Mirrors the Go / Jinja pins.
describe('TwigAdapter - #1966 @client defers attribute bindings', () => {
  function compileAttr(attrExpr: string) {
    const adapter = new TwigAdapter()
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
// (`bf.*_eval`), isomorphic with the Go / Jinja / Xslate `*_eval` helpers.
// Twig has no lambda fallback (divergence 3 in `twig-adapter.ts`'s header) —
// a predicate the evaluator can't model surfaces BF101 instead.
describe('TwigAdapter - #2073 value-producing .map(cb)', () => {
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

describe('TwigAdapter - higher-order predicate lowering (#2018 P2)', () => {
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
    // `forward` is a genuine boolean literal here (`true`/`false`).
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

  // #2075: `.includes(x)` joined the evaluator's `array-method` surface
  // (shared with the Perl/Go evaluator runtimes), so a predicate built from
  // it now routes through `bf.every_eval` like any other pure predicate —
  // no BF101, despite being a method-call predicate.
  test('.includes() in a predicate now lowers via the evaluator, not a BF101 refusal', () => {
    const { template } = compileAndGenerate(`
function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.includes('a')) ? 'y' : 'n'}</div>
}
export { A }
`)
    expect(template).toContain('bf.every_eval(')
    expect(template).toContain('"method":"includes"')
    expect(template).not.toContain('bf.truthy(\'\')')
  })

  // Divergence 3 (`twig-adapter.ts`'s header): Twig has no lambda
  // expression, so a predicate the evaluator can't serialize (a method call
  // outside the evaluator's `array-method` gate — only `includes` is
  // recognized there) has NO fallback — same as Jinja, unlike Kolon, which
  // falls back to a Perl lambda passed to `$bf.every`. This surfaces BF101
  // instead.
  test('a method-call predicate outside the evaluator surface has no lambda fallback — surfaces BF101', () => {
    const adapter = new TwigAdapter()
    const ir = compileToIR(`
function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.toUpperCase() === 'A') ? 'y' : 'n'}</div>
}
export { A }
`)
    const { template } = adapter.generate(ir)
    const errors = (adapter as unknown as { errors: { code: string; message: string }[] }).errors
    expect(errors.some(e => e.code === 'BF101' && e.message.includes("'.every(...)'"))).toBe(true)
    // No evaluator helper, and — critically — no lambda syntax either;
    // the condition falls back to the safe `bf.truthy('')` empty-string
    // sentinel (see `convertExpressionToTwig`'s BF101 path).
    expect(template).not.toContain('every_eval')
    expect(template).not.toContain('bf.every(')
    expect(template).toContain("bf.truthy('')")
  })
})

// #2075: derived signal/memo seeding now consumes the shared
// `computeSsrSeedPlan` (packages/jsx/src/ssr-seed-plan.ts) instead of
// re-deriving scope/support locally — same plan Jinja/Xslate/Mojo consume,
// ported to `{% set %}` + `??` syntax. Mirrors
// `packages/adapter-jinja/src/__tests__/jinja-adapter-unit.test.ts`'s
// "#2075 searchParams()-derived memo seeding" describe.
describe('TwigAdapter - #2075 searchParams()-derived memo seeding', () => {
  test('seeds an aliased scalar derived memo from the canonical reader', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function SortStatus() {
  const [sp] = createSearchParams()
  const sort = createMemo(() => sp().get('sort') ?? 'date')
  return <p>sort: {sort()}</p>
}
`)
    expect(template).toContain(
      "{% set sort = (searchParams.get('sort') ?? 'date') %}",
    )
  })

  // The evaluator-JSON `param` and the `bf` runtime object are
  // lowering-internal, not out-of-scope template vars (#2075). Twig routes
  // the filter predicate through `bf.filter_eval` (divergence 3 — no lambda
  // fallback), materializing the sibling getter call `tag()` into a bare
  // free-var read (`materializeGetterCalls`) so the evaluator can serialize
  // it at all; the captured env then resolves against the `tag` seed line
  // emitted just above (see `memo/seed.ts`'s file header).
  test('seeds a filter memo chained off the derived memo', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function TaggedList(props: { items: { title: string; tags: string[] }[] }) {
  const [searchParams] = createSearchParams()
  const tag = createMemo(() => searchParams().get('tag') ?? '')
  const visible = createMemo(() => props.items.filter((p) => !tag() || p.tags.includes(tag())))
  return <ul>{visible().map((p) => <li key={p.title}>{p.title}</li>)}</ul>
}
`)
    expect(template).toContain(
      "{% set tag = (searchParams.get('tag') ?? '') %}",
    )
    expect(template).toContain('{% set visible = bf.filter_eval(items,')
    expect(template).toContain("{'tag': tag}")
  })

  // The seed-scope guard used to scan the LOWERED template text for
  // bare-word tokens. That let an outer, unbound `p` (shadowed only inside
  // the callback) slip past as if it were the callback's own bound `p` —
  // emitting a bogus seed line. The guard now walks the parsed SOURCE tree
  // with proper lexical scoping (`freeIdentifiers`, inside
  // `computeSsrSeedPlan`), so this shape seeds nothing and falls back to the
  // static ssr-defaults path.
  test('an outer unbound `p` shadowed only inside the callback does not seed', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function C(props: { items: { ok: boolean }[] }) {
  const visible = createMemo(() => props.items.filter((p) => p.ok) && p)
  return <div>{String(visible())}</div>
}
`)
    expect(template).not.toContain('{% set visible')
  })

  // An out-of-scope bare `_` reference must not seed either.
  test('an out-of-scope bare `_` reference does not seed', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function C(props: { count: number }) {
  const doubled = createMemo(() => props.count * 2 + _)
  return <div>{doubled()}</div>
}
`)
    expect(template).not.toContain('{% set doubled')
  })
})

describe('TwigAdapter - named-slot capture identifier safety (#2168 jsx-element-prop)', () => {
  // A JSX-valued prop under a hyphenated name (`data-slot`, a valid JSX
  // attribute name) must not leak into the `{% set %}` capture variable's
  // identifier — Twig variable names can't contain `-`. The capture
  // identifier is purely counter-based (never derived from the prop name);
  // the hash KEY passed to `render_child` still carries the real name,
  // quoted via `twigHashKey`.
  test('a hyphenated prop name does not appear in the capture variable', () => {
    const { template } = compileAndGenerate(`
function Card(props) { return null }
export function Parent() {
  return <Card data-slot={<strong>Title</strong>}>text</Card>
}
`)
    expect(template).toContain('{% set bf_prop_0 %}')
    expect(template).toContain("'data-slot': bf_prop_0")
    expect(template).not.toContain('data-slot %}')
    expect(template).not.toContain('data-slot_')
  })
})

// #2038 nested-callback-predicate loudness is pinned at the shared
// conformance layer (workstream C): `filter-nested-callback-predicate` /
// `filter-nested-find-predicate` (BF101 via `expectedDiagnostics`) and
// `filter-nested-callback-predicate-client` (the `/* @client */` suppression
// twin, which must render clean).

// #2221: `_resolveLiteralConst` is a flat name lookup against
// `ir.metadata.localConstants` with no notion of AST scope — it used to
// substitute an outer const's literal value even at an occurrence that is
// actually an enclosing loop callback's own (shadowing) parameter, so every
// iteration rendered the same hard-coded literal. Guarded with the same
// coarse `collectLoopBoundNames` exclusion as #2212: any name a loop binds
// anywhere in the component never inlines, falling back to the bare
// identifier. SSR-only tests for the same #2222 reason as the #2212
// describe below.
describe('TwigAdapter - const inlining vs loop-param shadowing (#2221)', () => {
  test('a loop param shadowing an outer literal const emits the identifier, not the const value', () => {
    const { template } = compileAndGenerate(`
function Widget() {
  const label: string = 'x'
  return <ul>{[2, 5].map((label) => <li key={label}>{1 + label}</li>)}</ul>
}
`)
    // The loop body must reference the per-iteration loop var...
    expect(template).toContain('1 + label')
    // ...never the outer const's hard-coded value.
    expect(template).not.toContain("1 + 'x'")
  })

  test('a numeric const shadowed by a loop param emits the identifier too', () => {
    const { template } = compileAndGenerate(`
function Widget() {
  const count = 7
  return <ul>{[2, 5].map((count) => <li key={count}>{1 + count}</li>)}</ul>
}
`)
    expect(template).toContain('1 + count')
    expect(template).not.toContain('1 + 7')
  })

  test('a literal const NOT shadowed by any loop still inlines (#1897 pin)', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const totalPages = 5
  return <div>
    <p>Page 1 of {1 + totalPages}</p>
    <ul>{values.map((v) => <li key={v}>{v}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain('1 + 5')
  })

  // The accepted coarse-exclusion trade-off (same as #2212): a name that is
  // loop-bound ANYWHERE in the component never inlines, even at a genuinely
  // non-shadowed occurrence outside the loop — the bare identifier is
  // emitted instead of the value.
  test('a const referenced outside the loop whose name is loop-bound elsewhere falls back to the identifier (accepted trade-off)', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const label: string = 'x'
  return <div>
    <p>{1 + label}</p>
    <ul>{values.map((label) => <li key={label}>{2 + label}</li>)}</ul>
  </div>
}
`)
    expect(template).not.toContain("1 + 'x'")
    expect(template).toContain('2 + label')
  })
})

// #2237: `_resolveStaticRecordLiteral` (`IDENT.key` on a module-scope
// object-literal const, e.g. `variantClasses.ghost` — #1896/#1897) is a
// flat name lookup on `objectName` with no notion of AST scope, the
// record-literal sibling of #2221's `_resolveLiteralConst` bug. It used to
// substitute the outer const's member value even at an occurrence that is
// actually an enclosing loop callback's own (shadowing) parameter, so every
// iteration rendered the same hard-coded literal instead of the per-item
// value. Guarded with the same coarse `staticLoopSourceBoundNames`
// exclusion as #2221: any name a loop binds anywhere in the component
// never inlines, falling back to the bare `cfg.x` member expression.
describe('TwigAdapter - record-literal member lookup vs loop-param shadowing (#2237)', () => {
  test('a loop param shadowing an outer module object const emits the member access, not the outer literal', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
}
`)
    // The loop body must reference the per-iteration member access...
    expect(template).toContain('bf.string(cfg.x)')
    // ...never the outer const's hard-coded value.
    expect(template).not.toContain("bf.string('outer-lit')")
  })

  test('a module object const NOT shadowed by any loop still inlines (variantClasses.ghost shape, #1896/#1897 pin)', () => {
    const { template } = compileAndGenerate(`
const variantClasses = { solid: 'bg-solid', ghost: 'bg-ghost' }
function Widget({ variant }: { variant: 'solid' | 'ghost' }) {
  return <div>{variantClasses.ghost}</div>
}
`)
    expect(template).toContain("bf.string('bg-ghost')")
  })

  // The accepted coarse-exclusion trade-off (same as #2221/#2212): an
  // object name that is loop-bound ANYWHERE in the component never
  // inlines its member lookups, even at a genuinely non-shadowed
  // occurrence outside the loop — the bare member expression is emitted
  // instead of the value.
  test('a record member referenced outside the loop whose object name is loop-bound elsewhere falls back to the member expression (accepted trade-off)', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <div>
    <p>{cfg.x}</p>
    <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
  </div>
}
`)
    expect(template).not.toContain("bf.string('outer-lit')")
    expect(template).toContain('bf.string(cfg.x)')
  })
})

// Fable review (#2212): a loop callback's own param can shadow an outer
// string-typed prop/const of the same name — `collectLoopBoundNames`
// excludes every such name from `collectStringValueNames` so the shadowed
// occurrence never gets misdetected as string-typed. SSR-only (no Hono/CSR):
// a real, PRE-EXISTING, unrelated bug in ir-to-client-js's prop-substitution
// (filed as #2222) means ANY component where a loop param shadows an
// outer prop/const currently produces broken CLIENT js — so this can't be
// pinned via a cross-adapter fixture without also tripping that bug. The SSR
// template output alone, checked here, is unaffected by it.
describe('TwigAdapter - loop param shadowing a string-typed name (#2212)', () => {
  test('a loop param shadowing an outer string PROP stays numeric + inside the loop', () => {
    const { template } = compileAndGenerate(`
function Widget({ label }: { label: string }) {
  return <ul>{[2, 5].map((label) => <li key={label}>{1 + label}</li>)}</ul>
}
`)
    expect(template).toContain('1 + label')
    expect(template).not.toContain('1 ~ label')
  })

  // The outer `const label` itself is also inlined by-value at every
  // reference to the name (`_resolveLiteralConst`, scope-blind the same
  // way — filed as #2221, separate from this test's own #2212 scope), so
  // the loop body renders `1 + 'x'` rather than `1 + label`. That
  // substitution happens upstream of operator selection; what this test
  // actually pins is the OPERATOR itself never flipping to Twig's `~` for
  // the shadowed occurrence, regardless of which literal/identifier form
  // the operand takes by the time it reaches emission.
  test('a loop param shadowing an outer string LOCAL CONST stays numeric + inside the loop', () => {
    const { template } = compileAndGenerate(`
function Widget() {
  const label: string = 'x'
  return <ul>{[2, 5].map((label) => <li key={label}>{1 + label}</li>)}</ul>
}
`)
    expect(template).toContain('1 + ')
    expect(template).not.toContain('1 ~ ')
  })

  // `label + '!'` outside the loop concatenates via Twig's `~` regardless of
  // whether `label` survives the loop-bound exclusion: a bare string
  // *literal* operand (`'!'`) alone is decisive for `isStringConcatBinary`
  // (JS `+` with a string literal is always string concat, independent of
  // the other operand's type) — so this case never exercises the coarse
  // exclusion trade-off at all. The trade-off documented above (a
  // non-shadowed same-named string elsewhere in the component falling back
  // to numeric `+`) only shows up when BOTH operands' string-ness is
  // inferred solely from identifier lookup — e.g. `label + label`, where
  // the only string-typed name involved is the one excluded for being
  // loop-bound elsewhere in the component.
  test('a same-named identifier added to itself outside the loop falls back to numeric + (the accepted coarse-exclusion trade-off)', () => {
    const { template } = compileAndGenerate(`
function Widget({ label, values }: { label: string; values: number[] }) {
  return <div>
    <p>{label + label}</p>
    <ul>{values.map((label) => <li key={label}>{1 + label}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain('label + label')
    expect(template).not.toContain('label ~ label')
  })

  test('a string literal operand forces concat even for a name that is loop-bound elsewhere', () => {
    const { template } = compileAndGenerate(`
function Widget({ label, values }: { label: string; values: number[] }) {
  return <div>
    <p>{label + '!'}</p>
    <ul>{values.map((label) => <li key={label}>{1 + label}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain("label ~ '!'")
    expect(template).not.toContain("label + '!'")
  })

  // Fable re-review: a DESTRUCTURED loop param (`.map(({ name }) => ...)`)
  // shadows an outer string prop of the same name too. Twig lowers the
  // destructure to a `{% set name = __bf_item.name %}` local (#2087), which
  // leaves `name` reachable as a bare identifier in the loop body —
  // `collectLoopBoundNames` must read `paramBindings`, not just `param`
  // (which holds the raw, un-parsed destructure pattern text here), to
  // catch this shape.
  test('a destructured loop param shadowing an outer string PROP stays numeric + inside the loop', () => {
    const { template } = compileAndGenerate(`
function Widget({ name, rows }: { name: string; rows: { name: number }[] }) {
  return <ul>{rows.map(({ name }) => <li key={name}>{1 + name}</li>)}</ul>
}
`)
    expect(template).toContain('1 + name')
    expect(template).not.toContain('1 ~ name')
  })

  // Fable re-review: a `.filter(pred).map(cb)` chain's filter predicate
  // param can itself shadow an outer string-typed name, independent of the
  // map callback's own param — the predicate is lowered through the same
  // binary/string-name machinery before any rename to the loop's param.
  test('a filter() predicate param shadowing an outer string PROP stays numeric + in the filter condition', () => {
    const { template } = compileAndGenerate(`
function Widget({ n, values }: { n: string; values: number[] }) {
  return <ul>{values.filter(n => n + 1 > 3).map(v => <li key={v}>{v}</li>)}</ul>
}
`)
    expect(template).toContain('(v + 1) > 3')
    expect(template).not.toContain('(v ~ 1) > 3')
  })
})

// Fable review (#2208): a static array-literal loop SOURCE (a function-scope
// local const with no prop/signal/function-call dependency) must not resolve
// through resolveStaticLoopSource at a use site where a DIFFERENT, enclosing
// loop's own callback param shadows that same name — same shadowing hazard
// as #2212's identifier arm, now guarded via staticLoopSourceBoundNames.
describe('TwigAdapter - static loop source shadowed by an enclosing loop param (#2208)', () => {
  // Fable re-review: `staticLoopSourceBoundNames` is a coarse, GLOBAL
  // exclusion set (every loop-bound name anywhere in the component, not a
  // scope-precise "is THIS specific reference shadowed" check) — so once
  // the static resolution is suppressed, `items` also fails the older,
  // pre-#2208 identifier-based BF101 gate below it (which can't tell this
  // reference apart from a genuinely-unresolvable one either). The net
  // effect is a loud, conservative BF101 refusal — the same status quo
  // every function-scope static-const loop source had before #2208 — NOT
  // a silent, clean fallback to the identifier reference. Both are
  // asserted here so this test can't silently start passing for the wrong
  // reason if that changes.
  test('an outer const shadowed by an enclosing loop param refuses with BF101 instead of baking the wrong value', () => {
    const source = `
function Widget({ groups }: { groups: number[][] }) {
  const items = [1, 2]
  return <div>{groups.map((items, i) => <ul key={i}>{items.map(n => <li key={n}>{n}</li>)}</ul>)}</div>
}
`
    const result = compileJSX(source.trimStart(), 'test.tsx', { adapter: new TwigAdapter(), outputIR: true })
    expect(result.errors?.some(e => e.code === 'BF101')).toBe(true)
    const { template } = compileAndGenerate(source)
    // Whatever the template emits, it must never be the outer const's baked
    // value substituted for the shadowing loop param.
    expect(template).not.toContain('for n in [1, 2]')
  })

  test('an unrelated same-named const outside any shadowing loop still bakes cleanly (no BF101)', () => {
    const source = `
function Widget() {
  const items = [1, 2]
  return <ul>{items.map(n => <li key={n}>{n}</li>)}</ul>
}
`
    const result = compileJSX(source.trimStart(), 'test.tsx', { adapter: new TwigAdapter(), outputIR: true })
    expect(result.errors ?? []).toEqual([])
    const { template } = compileAndGenerate(source)
    expect(template).toContain('for n in [1, 2]')
  })
})

// A fragment-rooted component (top-level `<>...</>` return) has no single
// wrapping element to bound the client's scope query, so `renderFragment`
// brackets its children with a comment-based scope marker pair instead of
// element attributes. Without the end marker, a range query anchored on the
// begin marker has no lower bound and leaks onto later siblings owned by
// the parent (#2289). Mirrors the hono/xslate/jinja/mojo/go/erb adapters'
// fix — see `wrapWithScopeComment` in
// packages/adapter-hono/src/adapter/hono-adapter.ts.
describe('TwigAdapter - fragment-root scope comment end marker (#2289)', () => {
  test('renderFragment brackets a multi-root fragment with paired begin/end scope_comment calls', () => {
    const { template } = compileAndGenerate(`
export function ChildFragment() {
  return <><button>add</button><p>hint</p></>
}
`)
    expect(template).toContain('{{ bf.scope_comment() | raw }}')
    expect(template).toContain('{{ bf.scope_comment_end() | raw }}')
    // Begin marker precedes the children; end marker follows the fragment's
    // last top-level node -- both read the same `bf._scope_id()` at render
    // time, so the emitted scope ids are identical by construction.
    const beginIdx = template.indexOf('bf.scope_comment() | raw')
    const buttonIdx = template.indexOf('<button>')
    const pIdx = template.indexOf('<p>')
    const endIdx = template.indexOf('bf.scope_comment_end() | raw')
    expect(beginIdx).toBeLessThan(buttonIdx)
    expect(buttonIdx).toBeLessThan(pIdx)
    expect(pIdx).toBeLessThan(endIdx)
  })

  test('a non-fragment (single element) root does NOT get scope_comment_end (element attrs bound the scope instead)', () => {
    const { template } = compileAndGenerate(`
export function Child() {
  return <div>hi</div>
}
`)
    expect(template).not.toContain('scope_comment')
  })
})
