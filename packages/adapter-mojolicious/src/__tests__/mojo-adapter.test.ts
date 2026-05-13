/**
 * MojoAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Mojo-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { MojoAdapter } from '../adapter/mojo-adapter'
import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { renderMojoComponent, PerlNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

runAdapterConformanceTests({
  name: 'mojo',
  factory: () => new MojoAdapter(),
  render: renderMojoComponent,
  // Dynamic style objects (non-static values) require Perl template
  // interpolation support for JS object literals, not yet implemented.
  // `logical-or-jsx`, `nullish-coalescing-jsx`, `branch-map` reference
  // a prop directly inside a conditional branch (`$label`, `$banner`,
  // `$active`). The Mojo adapter emits these as bare Perl variables
  // (`% if ($label) { ... }`) without a corresponding
  // `my $label = ...;` declaration, so Perl rejects the template with
  // "Global symbol requires explicit package name". Same class of
  // Perl-scoping divergence that motivates the existing skips —
  // out of scope for the #971 refactor.
  // Return-position variants of the same divergence —
  // `return-logical-or` / `return-nullish-coalescing` reference
  // `$label` / `$banner` directly; `return-map` iterates over `$items`
  // without a `my` declaration.
  skipJsx: [
    'static-array-children',
    'style-object-dynamic',
    'logical-or-jsx',
    'nullish-coalescing-jsx',
    'branch-map',
    'return-logical-or',
    'return-nullish-coalescing',
    'return-map',
    // Same JS-only `Object.entries(...).filter(...)` shape the Go
    // adapter skips. The CSR self-heal (#1247, #1268) covers the bug
    // on the JS side; the Perl SSR side would need bespoke helpers
    // to materialise the loop at request time.
    'static-array-from-props',
    'static-array-from-props-with-component',
    // `Record<K, V>` + `obj[key]` index lookup (Button's variantClasses
    // pattern). MojoAdapter currently strips the lookup expression from
    // SSR output entirely — the bare `classes` identifier isn't
    // declared in template scope, and the regex-based convertExpression
    // doesn't know to materialise the object literal as a Perl hash
    // (`({a => 'class-a'})->{$variant}`). Pinning the failing fixture
    // as a skip rather than dropping it so the next attempt to ship
    // mojo with Button surfaces this in CI rather than at runtime.
    // Tracked: needs IR-level analysis or adapter-side hash rewrite.
    'record-index-lookup',
  ],
  // `JSON_STRINGIFY_VIA_CONST` and `MATH_FLOOR_VIA_CONST` now pass
  // via `MojoAdapter.templatePrimitives` (#1189). The two remaining
  // cases stay skipped because the V1 registry is identifier-path-
  // only and explicit:
  //   - `USER_IMPORT_VIA_CONST` — a bespoke user import isn't in
  //     the registry and can't be rendered server-side without
  //     user-supplied helper mappings.
  //   - `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` — uses `customSerialize`
  //     too, same reason.
  // Adding new entries to `templatePrimitives` should narrow this
  // skip set; see `MOJO_TEMPLATE_PRIMITIVES` in `mojo-adapter.ts`
  // for the full V1 surface.
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  onRenderError: (err, id) => {
    if (err instanceof PerlNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

// =============================================================================
// Helpers
// =============================================================================

function compileToIR(source: string, adapter?: MojoAdapter): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new MojoAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string, adapter?: MojoAdapter) {
  const a = adapter ?? new MojoAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

// =============================================================================
// Mojo-Specific Tests
// =============================================================================

describe('MojoAdapter - Template Generation', () => {
  test('generates basic element with scope marker', () => {
    const result = compileAndGenerate(`
export function Hello() {
  return <div>Hello</div>
}
`)
    expect(result.template).toContain('<div')
    expect(result.template).toContain('Hello')
    expect(result.template).toContain('bf-s=')
  })

  test('generates .html.ep extension', () => {
    const adapter = new MojoAdapter()
    expect(adapter.extension).toBe('.html.ep')
  })

  test('generates conditional with Perl if/else', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Toggle() {
  const [active, setActive] = createSignal(false)
  return <div>{active() ? 'On' : 'Off'}</div>
}
`)
    expect(result.template).toContain('% if')
    expect(result.template).toContain('% }')
  })

  test('generates loop with Perl for', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [items, setItems] = createSignal<string[]>([])
  return <ul>{items().map(item => <li>{item}</li>)}</ul>
}
`)
    expect(result.template).toContain('% for my')
    // Markers are scoped per-call-site (#1087): `bf->comment("loop:<id>")`.
    expect(result.template).toMatch(/bf->comment\("loop:[^"]+"\)/)
    expect(result.template).toMatch(/bf->comment\("\/loop:[^"]+"\)/)
  })

  test('generates script registration for client components', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`)
    expect(result.template).toContain("bf->register_script")
    expect(result.template).toContain('barefoot.js')
    expect(result.template).toContain('Counter.client.js')
  })

  test('does not generate script registration for static components', () => {
    const result = compileAndGenerate(`
export function Static() {
  return <div>Static content</div>
}
`)
    expect(result.template).not.toContain("bf->register_script")
  })

  test('forwards JSX children via begin/end capture (#1202)', () => {
    const result = compileAndGenerate(`
'use client'
export function Page() {
  return <main><Card><span>hello</span><span>world</span></Card></main>
}
`)
    // Capture lives in its own action so the inner `%>` can't close
    // the outer render_child tag.
    expect(result.template).toMatch(/<% my \$bf_children_\w+ = begin %>/)
    expect(result.template).toContain('<span>hello</span><span>world</span>')
    expect(result.template).toContain('<% end %>')
    expect(result.template).toMatch(
      /bf->render_child\('card'.*children => \$bf_children_\w+\)/,
    )
  })

  test('omits children entry when component has no JSX children', () => {
    const result = compileAndGenerate(`
'use client'
export function Page() {
  return <main><Card label="x" /></main>
}
`)
    expect(result.template).not.toContain('begin %>')
    expect(result.template).not.toContain('children =>')
  })
})

describe('MojoAdapter - templatePrimitives (#1189)', () => {
  // The registry fires when the call appears DIRECTLY in a JSX
  // expression position. Chained-const usage (`const j =
  // JSON.stringify(...); <div data-x={j}>`) routes through the
  // adapter's own const-resolution path; the conformance test for
  // that shape inspects the CLIENT JS, where the call IS inlined
  // (relocate accepts via the registry's boolean-acceptance side).

  test('JSON.stringify(props.x) emits bf->json($x) in SSR template', () => {
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { config: object }) {
  return <div data-config={JSON.stringify(props.config)}>hi</div>
}
`)
    expect(result.template).toContain('bf->json($config)')
    expect(result.template).not.toContain('JSON.stringify')
  })

  test('Math.floor(props.score) emits bf->floor($score) in SSR template', () => {
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { score: number }) {
  return <div data-rounded={Math.floor(props.score)}>hi</div>
}
`)
    expect(result.template).toContain('bf->floor($score)')
    expect(result.template).not.toContain('Math.floor')
  })

  test('Math.ceil / Math.round map to bf->ceil / bf->round', () => {
    const ceilResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: number }) {
  return <div data-x={Math.ceil(props.v)}>hi</div>
}
`)
    expect(ceilResult.template).toContain('bf->ceil($v)')

    const roundResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: number }) {
  return <div data-x={Math.round(props.v)}>hi</div>
}
`)
    expect(roundResult.template).toContain('bf->round($v)')
  })

  test('String(props.x) and Number(props.x) emit bf->string / bf->number', () => {
    const stringResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: number }) {
  return <div data-x={String(props.v)}>hi</div>
}
`)
    expect(stringResult.template).toContain('bf->string($v)')

    const numberResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: string }) {
  return <div data-x={Number(props.v)}>hi</div>
}
`)
    expect(numberResult.template).toContain('bf->number($v)')
  })

  test('nested primitive call (Math.floor(Number(props.x))) chains correctly', () => {
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { v: string }) {
  return <div data-x={Math.floor(Number(props.v))}>hi</div>
}
`)
    expect(result.template).toContain('bf->floor(bf->number($v))')
  })

  test('registry exposes the V1 callee surface', () => {
    // Pin the V1 surface so a future refactor doesn't accidentally
    // drop a primitive. New entries are additive — extend this
    // list rather than replace.
    const a = new MojoAdapter()
    const keys = Object.keys(a.templatePrimitives ?? {}).sort()
    expect(keys).toEqual(['JSON.stringify', 'Math.ceil', 'Math.floor', 'Math.round', 'Number', 'String'])
  })

  test('unregistered identifier-path callee is NOT accepted', () => {
    const a = new MojoAdapter()
    expect(a.templatePrimitives?.['customSerialize']).toBeUndefined()
  })

  test('wrong-arity primitive call falls back instead of emitting invalid Perl', () => {
    // V1 emit fns expect 1 arg. A 2-arg `JSON.stringify(x, replacer)`
    // must not produce `bf->json($x, $replacer)` (which Perl would
    // accept silently) — the arity gate records BF101 and leaves
    // the call un-substituted.
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { config: object; replacer: any }) {
  return <div data-x={JSON.stringify(props.config, props.replacer)}>hi</div>
}
`)
    expect(result.template).not.toContain('bf->json')
  })
})
