/**
 * `Date` lowering plugin (#2274) — the first catalogued rich-type lowering
 * built on top of the #2273 refusal seam. Covers the matcher's own
 * recognition rules directly (mirrors `query-href-recognition.test.ts`'s
 * `metadata()` extraction), plus the BF021-exemption integration promised by
 * `rich-type-refusal.ts`'s module doc: a call the registry claims must not
 * also fire BF021, while an un-catalogued Date method on the same receiver
 * still does.
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { compileJSX, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'
import { parseExpression, type ParsedExpr } from '../expression-parser'
import { datePlugin, DATE_METHODS } from '../date-lowering'
import { registerLoweringPlugin, __resetLoweringPluginsForTest, getLoweringPlugins } from '../lowering-registry'
import { ErrorCodes } from '../errors'

function metadata(src: string): ComponentIR['metadata'] {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
  const ir = JSON.parse(result.files.find((f) => f.type === 'ir')!.content) as ComponentIR
  return ir.metadata
}

/** Parse a call expression source and return its callee + args, the exact
 * shape a `LoweringMatcher` receives. */
function callParts(expr: string): { callee: ParsedExpr; args: ParsedExpr[] } {
  const parsed = parseExpression(expr)
  if (parsed.kind !== 'call') throw new Error(`expected a call expression, got ${parsed.kind}`)
  return { callee: parsed.callee, args: parsed.args }
}

describe('DATE_METHODS catalogue', () => {
  test('is exactly the 8 zero-arg Date.prototype accessors the spec entry names', () => {
    expect([...DATE_METHODS].sort()).toEqual(
      [
        'getUTCFullYear',
        'getUTCMonth',
        'getUTCDate',
        'getUTCHours',
        'getUTCMinutes',
        'getUTCSeconds',
        'getTime',
        'toISOString',
      ].sort(),
    )
  })
})

describe('datePlugin matcher recognition (#2274)', () => {
  test('props-object member chain (props.createdAt.toISOString()) matches', () => {
    const md = metadata(`
      export function Foo(props: { createdAt: Date }) {
        return <div>{props.createdAt.toISOString()}</div>
      }
    `)
    const matcher = datePlugin.prepare(md)
    expect(matcher).not.toBeNull()
    const { callee, args } = callParts('props.createdAt.toISOString()')
    expect(matcher!(callee, args)).toEqual({
      kind: 'helper-call',
      helper: 'date',
      args: [(callee as { object: ParsedExpr }).object, { kind: 'literal', value: 'toISOString', literalType: 'string' }],
    })
  })

  test('destructured Date prop (createdAt.getUTCFullYear()) matches', () => {
    const md = metadata(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.getUTCFullYear()}</div>
      }
    `)
    const matcher = datePlugin.prepare(md)
    expect(matcher).not.toBeNull()
    const { callee, args } = callParts('createdAt.getUTCFullYear()')
    expect(matcher!(callee, args)).toEqual({
      kind: 'helper-call',
      helper: 'date',
      args: [(callee as { object: ParsedExpr }).object, { kind: 'literal', value: 'getUTCFullYear', literalType: 'string' }],
    })
  })

  test('renamed destructured Date prop ({ createdAt: c }) resolves via the source name', () => {
    const md = metadata(`
      export function Foo({ createdAt: c }: { createdAt: Date }) {
        return <div>{c.getTime()}</div>
      }
    `)
    const matcher = datePlugin.prepare(md)
    expect(matcher).not.toBeNull()
    const { callee, args } = callParts('c.getTime()')
    expect(matcher!(callee, args)).toEqual({
      kind: 'helper-call',
      helper: 'date',
      args: [(callee as { object: ParsedExpr }).object, { kind: 'literal', value: 'getTime', literalType: 'string' }],
    })
  })

  test('#2274: destructured Date prop now carries a real propsParams TypeInfo (analyzer widening)', () => {
    // Pre-widening this degraded to { kind: 'unknown', raw: 'unknown' }
    // (analyzer.ts's #2150 primitives-only gate) — resolveReceiverType's
    // destructured path reads the type from propsType, not propsParams, so
    // the widening isn't load-bearing for the matcher above, but propsParams
    // is itself observable IR metadata this plugin's existence is meant to
    // unlock (see analyzer.ts's docstring on `isResolvablePrimitive`).
    const md = metadata(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toISOString()}</div>
      }
    `)
    const param = md.propsParams.find((p) => p.name === 'createdAt')
    expect(param?.type.kind).toBe('interface')
    expect(param?.type.raw).toBe('Date')
  })

  test('toLocaleDateString is not a catalogued method — declines (falls back to BF021)', () => {
    const md = metadata(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toLocaleDateString()}</div>
      }
    `)
    const matcher = datePlugin.prepare(md)
    expect(matcher).not.toBeNull() // Date IS reachable — the gate stays active …
    const { callee, args } = callParts('createdAt.toLocaleDateString()')
    expect(matcher!(callee, args)).toBeNull() // … but this specific method declines.
  })

  test('a catalogued method name called with an argument declines (zero-arg only)', () => {
    const md = metadata(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.getTime()}</div>
      }
    `)
    const matcher = datePlugin.prepare(md)
    expect(matcher).not.toBeNull()
    const { callee, args } = callParts('createdAt.getTime(1)')
    expect(matcher!(callee, args)).toBeNull()
  })

  test('a non-Date receiver never activates the plugin (prepare declines entirely)', () => {
    const md = metadata(`
      export function Foo({ createdAt }: { createdAt: string }) {
        return <div>{createdAt.toUpperCase()}</div>
      }
    `)
    expect(datePlugin.prepare(md)).toBeNull()
  })

  test('a component with no props type at all never activates the plugin', () => {
    const md = metadata(`
      export function Foo() {
        return <div>static</div>
      }
    `)
    expect(datePlugin.prepare(md)).toBeNull()
  })
})

describe('BF021 exemption via the real datePlugin (#2274 seam)', () => {
  afterEach(() => {
    __resetLoweringPluginsForTest(getLoweringPlugins().filter((p) => p.name !== 'date'))
  })

  function bf021Count(source: string): number {
    registerLoweringPlugin(datePlugin)
    const result = compileJSX(source.trimStart(), 'Test.tsx', { adapter: new TestAdapter() })
    return result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN).length
  }

  test('a catalogued call the plugin claims fires zero BF021', () => {
    expect(
      bf021Count(`
        export function Foo({ createdAt }: { createdAt: Date }) {
          return <div>{createdAt.toISOString()}</div>
        }
      `),
    ).toBe(0)
  })

  test('an un-catalogued Date method on the same prop still fires BF021', () => {
    expect(
      bf021Count(`
        export function Foo({ createdAt }: { createdAt: Date }) {
          return <div>{createdAt.toLocaleDateString()}</div>
        }
      `),
    ).toBe(1)
  })
})

describe('client-JS lowering (#2292)', () => {
  function clientJs(src: string): string {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.files.find((f) => f.type === 'clientJs')!.content
  }

  test('lowers a Date-typed prop accessor call to the date() runtime helper', () => {
    const js = clientJs(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toISOString()}</div>
      }
    `)
    expect(js).toContain('date(_p.createdAt, "toISOString")')
    // auto-imported from the runtime barrel (imports.ts RUNTIME_IMPORT_CANDIDATES)
    expect(js).toMatch(/import\s*\{[^}]*\bdate\b[^}]*\}\s*from\s*'@barefootjs\/client\/runtime'/)
  })

  test('leaves a non-Date receiver method call raw (parity: only what datePlugin claims)', () => {
    const js = clientJs(`
      export function Foo({ label }: { label: string }) {
        return <div>{label.toUpperCase()}</div>
      }
    `)
    expect(js).not.toContain('date(')
    expect(js).toContain('toUpperCase()')
  })

  test('protects a template-literal static segment that matches the call text (#2294)', () => {
    // The real call is in the ${…} interpolation; an identical-looking run
    // of text sits in the static segment. Template-aware string protection
    // must keep the non-global .replace from rewriting the static text
    // before the real call site (Copilot review).
    const js = clientJs(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{\`createdAt.toISOString() = \${createdAt.toISOString()}\`}</div>
      }
    `)
    // the real (interpolated) call is lowered
    expect(js).toContain('date(_p.createdAt, "toISOString")')
    // the static segment is preserved verbatim, not rewritten to date(...)
    expect(js).toContain('createdAt.toISOString() = ')
  })
})
