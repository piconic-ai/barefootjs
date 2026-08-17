/**
 * Catalogued Date/URL calls inside `/* @client *​/` expressions and reactive
 * attribute bindings (#2640, #2641).
 *
 * `emitClientOnlyExpressions` and `emitReactiveAttributeUpdates`
 * (`ir-to-client-js/emit-reactive.ts`) used to splice a reactive expression's
 * source text VERBATIM into the emitted `createEffect` body — correct for an
 * un-catalogued method (BF021 already refused anything else, and the
 * `/* @client *​/` escape is genuinely just "run this raw"), but wrong for a
 * CATALOGUED method (`.toISOString()`, an explicit-locale
 * `.toLocaleDateString(...)`, #2292/#2324): those never fire BF021 (a
 * registered lowering plugin claims them), yet the receiver still crosses
 * the `bf-p` hydration boundary as a de-riched JSON value. The sibling
 * non-`@client` TEXT path (`emitDynamicTextUpdates`) already routed a
 * catalogued call through the `date`/`formatDate` runtime helper before
 * hydrate re-evaluates it (#2292) — these two sites now share that same
 * rewrite via `makeCataloguedCallLowerer`.
 *
 * This suite compiles through `../index` (not the bare `../compiler`) so the
 * built-in lowering plugins (`datePlugin`, `toLocaleDatePlugin`) are
 * registered as the real package does — a call the registry doesn't know
 * about would fire BF021 and never reach the reactive-emission sites this
 * suite is about.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

function compile(src: string) {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
  const clientJs = result.files.find((f) => f.type === 'clientJs')!.content
  const bf021 = result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
  return { clientJs, bf021 }
}

describe('#2640 — /* @client */ text expressions route catalogued calls through the runtime helper', () => {
  test('a catalogued zero-arg accessor lowers to date(...), not the raw call', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ createdAt.toISOString()}</div>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('date(createdAt, "toISOString")')
    expect(clientJs).not.toContain('createdAt.toISOString()')
    expect(clientJs).toMatch(/import\s*\{[^}]*\bdate\b[^}]*\}\s*from\s*'@barefootjs\/client\/runtime'/)
  })

  test('an explicit-locale toLocaleDateString lowers to formatDate(...)', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ createdAt.toLocaleDateString('ja-JP', { timeZone: 'UTC' })}</div>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('formatDate(createdAt, "YYYY/M/D", "UTC")')
    expect(clientJs).not.toContain(".toLocaleDateString('ja-JP'")
  })

  test('an UNCATALOGUED method call stays verbatim (only what the matcher claims is rewritten)', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ createdAt.getDay()}</div>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('createdAt.getDay()')
    expect(clientJs).not.toContain('date(')
  })

  test('a zero-arg toLocaleDateString() (implicit locale) stays verbatim — the deliberate revival-escape case (#2639)', () => {
    // BF021 refuses this shape outside /* @client */ and recommends the
    // explicit `new Date(...)` revival wrapper as the sound escape; inside
    // /* @client */ it never fires (the directive already opts out), and
    // this suite pins that the compiler does NOT special-case it further —
    // an implicit-locale call is genuinely the user's own responsibility.
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ createdAt.toLocaleDateString()}</div>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('createdAt.toLocaleDateString()')
    expect(clientJs).not.toContain('formatDate(')
  })
})

describe('#2641 — reactive attribute bindings route catalogued calls through the runtime helper', () => {
  test('/* @client */ attribute, destructured-prop style', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div data-x={/* @client */ createdAt.toISOString()} />
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('date(_p.createdAt, "toISOString")')
    expect(clientJs).not.toContain('createdAt.toISOString()')
  })

  test('/* @client */ attribute, props-object style', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo(props: { createdAt: Date }) {
        return <div data-x={/* @client */ props.createdAt.toISOString()} />
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('date(_p.createdAt, "toISOString")')
    expect(clientJs).not.toContain('props.createdAt.toISOString()')
  })

  test('non-@client reactive attribute, a catalogued call — the broader gap #2641 found: this site has no directive at all, and previously spliced the raw call verbatim too', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt, label }: { createdAt: Date; label: string }) {
        return <time data-iso={createdAt.toISOString()}>{label}</time>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('date(_p.createdAt, "toISOString")')
    expect(clientJs).not.toContain('_p.createdAt.toISOString()')
  })

  test('an explicit-locale toLocaleDateString in attribute position lowers to formatDate(...)', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div data-x={/* @client */ createdAt.toLocaleDateString('ja-JP', { timeZone: 'UTC' })} />
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('formatDate(_p.createdAt, "YYYY/M/D", "UTC")')
  })

  test('an uncatalogued attribute method call stays verbatim', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div data-x={/* @client */ createdAt.getDay()} />
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('createdAt.getDay()')
    expect(clientJs).not.toContain('date(')
  })

  test('a non-Date reactive attribute is untouched', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ label }: { label: string }) {
        return <div data-x={/* @client */ label.toUpperCase()} />
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('label.toUpperCase()')
    expect(clientJs).not.toContain('date(')
  })
})

describe('#2645 — /* @client */ text expressions elide in the static/CSR template like SSR', () => {
  // `irToComponentTemplateWithOpts`'s 'expression' case never checked
  // `node.clientOnly` — a bare-destructured-prop receiver (`isSimplePropExpression`
  // treats `createdAt.toISOString()` as "simple") routed to this static
  // template builder, which had no clientOnly awareness and inlined the
  // (possibly lowered) value directly, breaking SSR/CSR byte parity: SSR
  // renders the @client region empty, this builder rendered it populated.
  test('markerless: the region is fully empty, matching SSR', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ createdAt.toISOString()}</div>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('template: (_p) => `<div bf="s1"></div>`')
  })

  test('marker pair (adjacent static text defeats markerless elision): empty marker pair, no inlined value', () => {
    const { clientJs, bf021 } = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>ISO: {/* @client */ createdAt.toISOString()}</div>
      }
    `)
    expect(bf021).toHaveLength(0)
    expect(clientJs).toContain('template: (_p) => `<div bf="s1">ISO: <!--bf:s0--><!--/--></div>`')
  })
})
