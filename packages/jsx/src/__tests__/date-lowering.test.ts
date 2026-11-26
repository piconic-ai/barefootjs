/**
 * `Date` lowering plugin (#2274) — the first catalogued rich-type lowering
 * built on top of the #2273 refusal seam. Covers the matcher's own
 * recognition rules directly (mirrors `query-href-recognition.test.ts`'s
 * `metadata()` extraction), plus the BF021-exemption integration promised by
 * `rich-type-refusal.ts`'s module doc: a call the registry claims must not
 * also fire BF021, while an un-catalogued Date method on the same receiver
 * still does.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { compileJSX, inlineIntersectionMembers, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'
import { parseExpression, type ParsedExpr } from '../expression-parser'
import { datePlugin, DATE_METHODS } from '../date-lowering'
import { registerLoweringPlugin, __resetLoweringPluginsForTest, getLoweringPlugins, type LoweringPlugin } from '../lowering-registry'
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
    // unlock (see analyzer.ts's docstring on `isResolvableMemberType`).
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
  // Snapshot + restore around the WHOLE describe block (not a per-test
  // afterEach filtering 'date' out of whatever's currently registered) —
  // `bun test` runs every file in one process, so a per-test filter leaves
  // 'date' permanently missing from the shared registry once this block's
  // LAST test finishes, silently breaking any later-executing test file
  // that depends on the real built-in (e.g. client-only-date-lowering.test.ts's
  // reactive-attribute lowering) — bun does not guarantee file execution
  // order matches argument/discovery order, so this doesn't reliably
  // reproduce locally but did intermittently fail in CI. Mirrors the same
  // snapshot/restore shape `rich-type-method-refusal.test.ts` already uses.
  let savedPlugins: readonly LoweringPlugin[]
  beforeAll(() => {
    savedPlugins = getLoweringPlugins()
  })
  afterAll(() => {
    __resetLoweringPluginsForTest(savedPlugins)
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

describe('Date members inherited through extends / intersection (#3914)', () => {
  function matches(src: string, call: string): boolean {
    const matcher = datePlugin.prepare(metadata(src))
    if (!matcher) return false
    const { callee, args } = callParts(call)
    return matcher(callee, args) !== null
  }

  test('interface extends: a Date declared on the base is lowered', () => {
    expect(
      matches(
        `interface Base { at: Date }
         interface Props extends Base { label: string }
         export function Foo(props: Props) { return <p>{props.at.getUTCFullYear()}</p> }`,
        'props.at.getUTCFullYear()',
      ),
    ).toBe(true)
  })

  test('multi-level extends and a destructured prop resolve', () => {
    expect(
      matches(
        `interface A { at: Date }
         interface B extends A { n: number }
         interface Props extends B { label: string }
         export function Foo({ at }: Props) { return <p>{at.getTime()}</p> }`,
        'at.getTime()',
      ),
    ).toBe(true)
  })

  test('intersection alias: a Date declared on a constituent is lowered', () => {
    expect(
      matches(
        `interface Base { at: Date }
         type Props = Base & { label: string }
         export function Foo(props: Props) { return <p>{props.at.getTime()}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(true)
  })

  test('an own member overrides an inherited one of the same name', () => {
    expect(
      matches(
        `interface Base { at: Date }
         interface Props extends Base { at: string }
         export function Foo(props: Props) { return <p>{props.at.getTime()}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(false)
  })

  test('a cyclic extends chain does not hang', () => {
    expect(
      matches(
        `interface A extends B { x: string }
         interface B extends A { y: string }
         export function Foo(props: A) { return <p>{props.x}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(false)
  })

  test('a parenthesized and nested intersection arm still contributes its members', () => {
    expect(
      matches(
        `interface Base { at: Date }
         type Props = ((Base) & { n: number }) & { label: string }
         export function Foo(props: Props) { return <p>{props.at.getTime()}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(true)
  })

  test.each([
    ['Base & { at: Date }', 'type Props = Base & { at: Date }'],
    ['{ at: Date } & Base', 'type Props = { at: Date } & Base'],
  ])('an intersection refines unknown to Date regardless of arm order: %s', (_name, alias) => {
    expect(
      matches(
        `interface Base { at: unknown }
         ${alias}
         export function Foo(props: Props) { return <p>{props.at.getTime()}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(true)
  })

  test('Date & Date | null across intersection arms narrows to Date, at depth 2 too', () => {
    expect(
      matches(
        `type Data = { at: Date } & { at: Date | null }
         interface Props { data: Data }
         export function Foo(props: Props) { return <p>{props.data.at.getTime()}</p> }`,
        'props.data.at.getTime()',
      ),
    ).toBe(true)
  })

  function refusals(src: string): string[] {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN).map((e) => e.message)
  }

  test('a base declared elsewhere is refused loudly instead of rendering empty', () => {
    const messages = refusals(`
      import type { Base } from './base'
      interface Props extends Base { label: string }
      export function Foo(props: Props) { return <p>{props.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("'props.at'")
    expect(messages[0]).toContain('not declared here')
  })

  test('the same refusal applies to a destructured prop and an intersection with an imported type', () => {
    expect(
      refusals(`
        import type { Base } from './base'
        type Props = Base & { label: string }
        export function Foo({ at }: Props) { return <p>{at.getTime()}</p> }
      `),
    ).toHaveLength(1)
  })

  test('a prop that is visible on the props type is not refused, whatever its type', () => {
    expect(
      refusals(`
        import type { Base } from './base'
        interface Props extends Base { label: string }
        export function Foo(props: Props) { return <p>{props.label.toISOString()}</p> }
      `),
    ).toHaveLength(0)
  })

  test('a props type with no unresolved base is not refused', () => {
    expect(
      refusals(`
        interface Base { at: Date }
        interface Props extends Base { label: string }
        export function Foo(props: Props) { return <p>{props.at.getUTCFullYear()}</p> }
      `),
    ).toHaveLength(0)
  })

  test('an intersection whose arms declare irreconcilable types for the prop is refused, in either order', () => {
    for (const alias of ['Base & { at: Date }', '{ at: Date } & Base']) {
      const messages = refusals(`
        interface Base { at: string }
        type Props = ${alias}
        export function Foo(props: Props) { return <p>{props.at.getUTCFullYear()}</p> }
      `)
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain('cannot be reconciled')
    }
  })

  test('an own member overrides a conflicting inherited one on interface extends (no refusal)', () => {
    expect(
      refusals(`
        interface Base { at: string }
        interface Props extends Base { at: Date }
        export function Foo(props: Props) { return <p>{props.at.getUTCFullYear()}</p> }
      `),
    ).toHaveLength(0)
  })

  test('a call claimed by a registered lowering plugin is not refused (#3914)', () => {
    const claim: LoweringPlugin = {
      name: 'claim-inherited-date',
      prepare: () => (callee) =>
        callee.kind === 'member' && callee.property === 'getUTCFullYear'
          ? { kind: 'helper-call', helper: 'date', args: [callee.object, { kind: 'literal', value: callee.property, literalType: 'string' }] }
          : null,
    }
    const saved = getLoweringPlugins()
    registerLoweringPlugin(claim)
    try {
      expect(
        refusals(`
          import type { Base } from './base'
          interface Props extends Base { label: string }
          export function Foo(props: Props) { return <p>{props.at.getUTCFullYear()}</p> }
        `),
      ).toHaveLength(0)
    } finally {
      __resetLoweringPluginsForTest(saved)
    }
  })

  test('a conflict on a NESTED receiver is refused, not silently left raw', () => {
    for (const data of ['{ at: Date } & { at: string }', '{ at: string } & { at: Date }']) {
      const messages = refusals(`
        type Data = ${data}
        interface Props { data: Data }
        export function Foo(props: Props) { return <p>{props.data.at.getUTCFullYear()}</p> }
      `)
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain("'props.data.at'")
      expect(messages[0]).toContain('cannot be reconciled')
    }
  })

  test('an unresolved base on a NESTED containing type is refused', () => {
    const messages = refusals(`
      import type { Base } from './base'
      interface Data extends Base { n: number }
      interface Props { data: Data }
      export function Foo(props: Props) { return <p>{props.data.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('not declared here')
  })
})

describe('Date members through an inline intersection props type (#3938)', () => {
  function matches(src: string, call: string): boolean {
    const matcher = datePlugin.prepare(metadata(src))
    if (!matcher) return false
    const { callee, args } = callParts(call)
    return matcher(callee, args) !== null
  }

  function refusals(src: string): string[] {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN).map((e) => e.message)
  }

  test('the props type keeps the constituents; nothing else changes shape', () => {
    const meta = metadata(`
      interface Base { at: Date }
      export function Foo(props: Base & { label: string }) { return <p>{props.label}</p> }
    `)
    expect(meta.propsType?.kind).toBe('object')
    expect(meta.propsType?.inheritance).toBe('intersection')
    expect(meta.propsType?.inherits?.map((t) => t.kind)).toEqual(['interface', 'object'])
    expect(meta.propsType?.properties).toBeUndefined()
  })

  test.each([
    ['Base & { label: string }'],
    ['{ label: string } & Base'],
    ['(Base & { id: string }) & { label: string }'],
    ['((Base)) & { label: string }'],
  ])('a Date declared on a constituent is lowered: %s', (props) => {
    expect(
      matches(
        `interface Base { at: Date }
         export function Foo(props: ${props}) { return <p>{props.at.getTime()}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(true)
  })

  test('a Date declared on an object literal arm, and a destructured prop, are lowered', () => {
    expect(
      matches(
        `interface Named { label: string }
         export function Foo({ at }: Named & { at: Date }) { return <p>{at.getTime()}</p> }`,
        'at.getTime()',
      ),
    ).toBe(true)
  })

  test('a Date reached through a nested receiver on a constituent is lowered', () => {
    expect(
      matches(
        `interface Data { at: Date }
         interface Base { data: Data }
         export function Foo(props: Base & { label: string }) { return <p>{props.data.at.getTime()}</p> }`,
        'props.data.at.getTime()',
      ),
    ).toBe(true)
  })

  test('a member that is not a Date on any constituent is not lowered', () => {
    expect(
      matches(
        `interface Base { at: string }
         export function Foo(props: Base & { label: string; d: Date }) { return <p>{props.at.getTime()}</p> }`,
        'props.at.getTime()',
      ),
    ).toBe(false)
  })

  test('a constituent declared elsewhere is refused loudly instead of rendering empty', () => {
    const messages = refusals(`
      import type { Base } from './base'
      export function Foo(props: Base & { label: string }) { return <p>{props.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("'props.at'")
    expect(messages[0]).toContain('not declared here')
  })

  test('the refusal applies to a destructured prop, and a visible prop is not refused', () => {
    const imported = `import type { Base } from './base'\n`
    expect(
      refusals(`${imported}export function Foo({ at }: Base & { label: string }) { return <p>{at.getTime()}</p> }`),
    ).toHaveLength(1)
    expect(
      refusals(`${imported}export function Foo(props: Base & { label: string }) { return <p>{props.label.toISOString()}</p> }`),
    ).toHaveLength(0)
  })

  test('constituents with irreconcilable declarations of the prop are refused', () => {
    const messages = refusals(`
      interface Base { at: string }
      export function Foo(props: Base & { at: Date }) { return <p>{props.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('cannot be reconciled')
  })
})

describe('Date members through an inline intersection member type (#3949)', () => {
  function matches(src: string, call: string): boolean {
    const matcher = datePlugin.prepare(metadata(src))
    if (!matcher) return false
    const { callee, args } = callParts(call)
    return matcher(callee, args) !== null
  }

  function refusals(src: string): string[] {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN).map((e) => e.message)
  }

  test('the member keeps its kind and carries the constituents', () => {
    const meta = metadata(`
      type A = { at: Date }
      interface B { label: string }
      export function Foo(props: { data: A & B }) { return <p>{props.data.label}</p> }
    `)
    const data = meta.propsType?.properties?.find((p) => p.name === 'data')?.type
    expect(data?.kind).toBe('unknown')
    expect(data?.raw).toBe('A & B')
    expect(data?.inheritance).toBe('intersection')
    expect(data?.inherits?.map((t) => [t.kind, t.raw])).toEqual([
      ['interface', 'A'],
      ['interface', 'B'],
    ])
    expect(data?.properties).toBeUndefined()
  })

  test('a non-intersection member carries no constituents', () => {
    const meta = metadata(`
      type A = { at: Date }
      export function Foo(props: { data: A; list: (A | null)[] }) { return <p>{props.data.at.getTime()}</p> }
    `)
    for (const p of meta.propsType?.properties ?? []) expect(p.type.inherits).toBeUndefined()
  })

  test.each([
    ['inline props type', `export function Foo(props: { data: A & B }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['props interface', `interface Props { data: A & B }
     export function Foo(props: Props) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['props alias', `type Props = { data: A & B }
     export function Foo(props: Props) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['destructured', `export function Foo({ data }: { data: A & B }) { return <p>{data.at.getTime()}</p> }`, 'data.at.getTime()'],
    ['arm order reversed', `export function Foo(props: { data: B & A }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['parenthesized arms', `export function Foo(props: { data: ((A) & (B & { id: string })) }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['nullable union arm', `export function Foo(props: { data: (A & B) | null }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['deeper member', `export function Foo(props: { outer: { data: A & B } }) { return <p>{props.outer.data.at.getTime()}</p> }`, 'props.outer.data.at.getTime()'],
    ['literal arm', `export function Foo(props: { data: B & { at: Date } }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['member of an intersection props type', `export function Foo(props: B & { data: A & B }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
  ])('a Date declared on a constituent is lowered: %s', (_label, component, call) => {
    expect(matches(`type A = { at: Date }\ninterface B { label: string }\n${component}`, call)).toBe(true)
  })

  test('a member intersecting the type that declares it does not loop the activation walk', () => {
    const src = (at: string) => `
      interface B { label: string }
      interface A { next: A & B; at: ${at} }
      export function Foo(props: { data: A }) { return <p>{props.data.next.at.getTime()}</p> }`
    expect(matches(src('string'), 'props.data.next.at.getTime()')).toBe(false)
    expect(matches(src('Date'), 'props.data.next.at.getTime()')).toBe(true)
  })

  test('a member that is not a Date on any constituent is not lowered', () => {
    expect(
      matches(
        `type A = { at: string }
         export function Foo(props: { data: A & { label: string }; d: Date }) { return <p>{props.data.at.getTime()}</p> }`,
        'props.data.at.getTime()',
      ),
    ).toBe(false)
  })

  test('an imported constituent is refused loudly instead of rendering empty', () => {
    const messages = refusals(`
      import type { A } from './a'
      type B = { label: string }
      export function Foo(props: { data: A & B }) { return <p>{props.data.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("'at'")
    expect(messages[0]).toContain('not declared here')
  })

  test('a constituent that is not a reference or object literal is refused loudly', () => {
    const messages = refusals(`
      type B = { label: string }
      export function Foo(props: { data: B & ({ at: Date } | { at: string }) }) { return <p>{props.data.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('not declared here')
  })

  test('a member visible on a local constituent is not refused next to an imported one', () => {
    expect(
      refusals(`
        import type { A } from './a'
        type B = { label: string }
        export function Foo(props: { data: A & B }) { return <p>{props.data.label.toUpperCase()}</p> }
      `),
    ).toHaveLength(0)
  })

  test('a loop row typed as an inline intersection is treated like the alias form', () => {
    const loop = (element: string) =>
      refusals(`
        type A = { at: Date }
        type B = { label: string }
        type AB = A & B
        export function Foo(props: { items: ${element}[] }) {
          return <ul>{props.items.map((i) => <li key={i.label}>{i.at.getUTCFullYear()}</li>)}</ul>
        }
      `)
    expect(loop('(A & B)')).toEqual(loop('AB'))
    expect(loop('(A & B)')).toHaveLength(1)
  })

  test('constituents with irreconcilable declarations of the member are refused', () => {
    const messages = refusals(`
      type A = { at: Date }
      export function Foo(props: { data: A & { at: string } }) { return <p>{props.data.at.getUTCFullYear()}</p> }
    `)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('cannot be reconciled')
  })
})

describe('the members of a nested inline intersection (#3971)', () => {
  test('a destructured member typed as an intersection of local object types carries the intersection, as the props-object form does', () => {
    const src = (param: string) => `
      type A = { at: Date }
      interface B { label: string }
      export function Foo(${param}) { return <p>x</p> }`
    const destructured = metadata(src('{ data }: { data: A & B }')).propsParams.find((p) => p.name === 'data')
    const object = metadata(src('props: { data: A & B }')).propsParams.find((p) => p.name === 'data')
    expect(destructured?.type.inheritance).toBe('intersection')
    expect(destructured?.type.raw).toBe(object?.type.raw)
    expect(destructured?.declaredType).toBeUndefined()
  })

  test('a destructured member intersecting an imported type keeps the unresolved form', () => {
    const meta = metadata(`
      import type { A } from './a'
      interface B { label: string }
      export function Foo({ data }: { data: A & B }) { return <p>x</p> }`)
    const data = meta.propsParams.find((p) => p.name === 'data')
    expect(data?.type.kind).toBe('unknown')
    expect(data?.type.inherits).toBeUndefined()
    expect(data?.declaredType?.inheritance).toBe('intersection')
  })

  test('inlineIntersectionMembers merges every arm, and declines what it cannot know', () => {
    const members = (decls: string, type: string) => {
      const meta = metadata(`${decls}\nexport function Foo(props: { data: ${type} }) { return <p>x</p> }`)
      const data = meta.propsParams.find((p) => p.name === 'data')!
      return inlineIntersectionMembers(data.type, meta)?.map((p) => [p.name, p.type.raw]) ?? null
    }
    expect(members('type A = { at: Date }\ninterface B { label: string }', 'A & B')).toEqual([
      ['at', 'Date'],
      ['label', 'string'],
    ])
    expect(members('interface N { label: string }', '(N & { id: string }) & { at: Date }')).toEqual([
      ['label', 'string'],
      ['id', 'string'],
      ['at', 'Date'],
    ])
    expect(members('type A = { at: Date | null }', 'A & { at: Date }')).toEqual([['at', 'Date']])
    expect(members("import type { A } from './a'\ntype B = { label: string }", 'A & B')).toBeNull()
    expect(members('type A = { at: Date }', 'A & { at: string }')).toBeNull()
    expect(members('type A = { at: Date }', 'A')).toBeNull()
  })

  test.each([
    ['an index signature', 'type A = { [key: string]: string }', 'A & { label: string }'],
    ['an inline index signature', '', '{ [key: string]: string } & { label: string }'],
    ['a method', 'interface A { label: string; describe(): string }', 'A & { id: string }'],
    ['a mapped type', "type K = 'x'\ntype A = { [P in K]: string }", 'A & { label: string }'],
    ['a generic', 'type Box<T> = { value: T }', 'Box<string> & { label: string }'],
    ['a Record', '', 'Record<string, string> & { label: string }'],
    ['a union alias', 'type U = { a: string } | { b: string }', 'U & { label: string }'],
    ['an `any` arm', '', 'any & { label: string }'],
    ['an open arm reached through an alias', 'type A = { [key: string]: string }\ntype AA = A & { id: string }', 'AA & { label: string }'],
  ])('inlineIntersectionMembers declines a constituent whose keys are not all properties: %s', (_label, decls, type) => {
    const meta = metadata(`${decls}\nexport function Foo(props: { data: ${type} }) { return <p>x</p> }`)
    const data = meta.propsParams.find((p) => p.name === 'data')!
    expect(inlineIntersectionMembers(data.type, meta)).toBeNull()
  })

  test('openMembers marks a type literal or definition with a non-property member or type parameters', () => {
    const meta = metadata(`
      type Open = { [key: string]: string }
      interface WithMethod { describe(): string }
      type Box<T> = { value: T }
      type Closed = { label: string }
      export function Foo(props: { a: { [key: string]: string }; b: { label: string } }) { return <p>x</p> }`)
    const def = (name: string) => meta.typeDefinitions.find((d) => d.name === name)
    expect(def('Open')?.openMembers).toBe(true)
    expect(def('WithMethod')?.openMembers).toBe(true)
    expect(def('Box')?.openMembers).toBe(true)
    expect(def('Closed')?.openMembers).toBeUndefined()
    expect(meta.propsParams.find((p) => p.name === 'a')?.type.openMembers).toBe(true)
    expect(meta.propsParams.find((p) => p.name === 'b')?.type.openMembers).toBeUndefined()
  })
})

describe('a parenthesized type lowers like the type it wraps (#3973)', () => {
  const AB = 'type AB = { at: Date; label: string }'

  function matches(src: string, call: string): boolean {
    const matcher = datePlugin.prepare(metadata(src))
    if (!matcher) return false
    const { callee, args } = callParts(call)
    return matcher(callee, args) !== null
  }

  function refusals(src: string): string[] {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN).map((e) => e.message)
  }

  function memberType(member: string): unknown {
    const meta = metadata(`${AB}\nexport function Foo(props: { data: ${member} }) { return <p>{props.data.label}</p> }`)
    return meta.propsType?.properties?.find((p) => p.name === 'data')?.type
  }

  test.each([
    ['(AB)', 'AB'],
    ['((AB))', 'AB'],
    ['(AB)[]', 'AB[]'],
    ['Array<(AB)>', 'Array<AB>'],
    ['(AB) | null', 'AB | null'],
    ['({ at: Date })', '{ at: Date }'],
    ["('x' | 'y') | 'z'", "'x' | 'y' | 'z'"],
    ["'x' | ('y' | ('z'))", "'x' | 'y' | 'z'"],
    ['(AB | null) | undefined', 'AB | null | undefined'],
    ['(AB | null)[]', '(AB | null)[]'],
    ['Array<(AB | null)>', 'Array<AB | null>'],
  ])('member type %s has the same TypeInfo as %s, raw included', (parenthesized, bare) => {
    // `raw` of the outer node keeps its own spelling; compare the structure below it.
    const strip = (info: unknown): unknown => JSON.parse(JSON.stringify(info, (k, v) => (k === 'raw' ? undefined : v)))
    expect(strip(memberType(parenthesized))).toEqual(strip(memberType(bare)))
  })

  test('the wrapped node names the type, not the parentheses', () => {
    expect(memberType('(AB)')).toMatchObject({ kind: 'interface', raw: 'AB' })
    expect(memberType('(AB)[]')).toMatchObject({ kind: 'array', raw: '(AB)[]', elementType: { kind: 'interface', raw: 'AB' } })
  })

  test.each([
    ['inline props type', `export function Foo(props: { data: (AB) }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['props interface', `interface Props { data: ((AB)) }
     export function Foo(props: Props) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['destructured', `export function Foo({ data }: { data: (AB) }) { return <p>{data.at.getTime()}</p> }`, 'data.at.getTime()'],
    ['nullable union arm', `export function Foo(props: { data: (AB) | null }) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['parenthesized props annotation', `export function Foo(props: ({ data: AB })) { return <p>{props.data.at.getTime()}</p> }`, 'props.data.at.getTime()'],
    ['parenthesized props alias body', `type Props = ({ data: AB })
     export function Foo({ data }: Props) { return <p>{data.at.getTime()}</p> }`, 'data.at.getTime()'],
  ])('a Date read through a parenthesized type is lowered: %s', (_label, component, call) => {
    expect(matches(`${AB}\n${component}`, call)).toBe(true)
  })

  test('a parenthesized alias body records the same properties as a bare one', () => {
    const props = (body: string) =>
      metadata(`type AB = ${body}\nexport function Foo(props: { data: AB }) { return <p>{props.data.label}</p> }`)
        .typeDefinitions?.find((t) => t.name === 'AB')?.properties?.map((p) => [p.name, p.type.kind])
    expect(props('({ at: Date; label: string })')).toEqual(props('{ at: Date; label: string }'))
    expect(props('({ at: Date; label: string })')).toHaveLength(2)
  })

  test.each(['(AB)[]', 'Array<(AB)>', '((AB))[]'])('a loop row typed %s is refused exactly like AB[]', (items) => {
    const loop = (element: string) =>
      refusals(`
        ${AB}
        export function Foo(props: { items: ${element} }) {
          return <ul>{props.items.map((i) => <li key={i.label}>{i.at.getUTCFullYear()}</li>)}</ul>
        }
      `)
    expect(loop(items)).toEqual(loop('AB[]'))
    expect(loop(items)).toHaveLength(1)
  })
})

describe('a catalogued Date call on a loop row (#3972)', () => {
  function refusals(src: string): { message: string; suggestion: string }[] {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.errors
      .filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
      .map((e) => ({ message: e.message, suggestion: e.suggestion?.message ?? '' }))
  }
  const rowLoop = (element: string, body = '{r.at.getUTCFullYear()}', param = 'r') => `
    type A = { at: Date }
    type B = { id: string }
    type Row = { id: string; at: Date }
    export function Foo(props: { rows: ${element}[] }) {
      return <ul>{props.rows.map((${param}) => <li key="k">${body}</li>)}</ul>
    }`

  test.each(['Row', '{ id: string; at: Date }', '(A & B)'])('a row typed %s names the loop row, not a missing lowering', (element) => {
    const errs = refusals(rowLoop(element))
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain("'.getUTCFullYear()' is a catalogued Date method")
    expect(errs[0].message).toContain("'r.at' is read through the loop row binding 'r'")
    expect(errs[0].message).not.toContain('no catalogued lowering')
    expect(errs[0].suggestion).toContain('{/* @client */ new Date(r.at).getUTCFullYear()}')
  })

  test('a destructured row is refused like the member read, instead of reaching the template as a plain call', () => {
    const errs = refusals(rowLoop('Row', '{at.getUTCFullYear()}', '{ at }'))
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain("'at' is a loop row binding")
    expect(refusals(rowLoop('{ meta: { at: Date } }', '{at.getTime()}', '{ meta: { at } }'))).toHaveLength(1)
  })

  test('a destructured binding with no member evidence stays unrefused', () => {
    expect(refusals(rowLoop('[Date]', '{at.getTime()}', '[at]'))).toHaveLength(0)
    expect(refusals(rowLoop('Row', '{rest.at.getTime()}', '{ id, ...rest }'))).toHaveLength(0)
  })

  test('a row that is itself a Date, and a nested row, name their own binding', () => {
    expect(refusals(rowLoop('Date', '{r.getTime()}'))[0].message).toContain("'r' is a loop row binding")
    const nested = refusals(`
      type Row = { kids: { at: Date }[] }
      export function Foo(props: { rows: Row[] }) {
        return <ul>{props.rows.map((r) => <li key="k">{r.kids.map((k) => <b key="x">{k.at.toISOString()}</b>)}</li>)}</ul>
      }`)
    expect(nested).toHaveLength(1)
    expect(nested[0].message).toContain("'k.at' is read through the loop row binding 'k'")
  })

  test('an explicit-input toLocaleDateString on a row names the loop row', () => {
    const errs = refusals(rowLoop('Row', "{r.at.toLocaleDateString('en-US', { timeZone: 'UTC' })}"))
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain("'.toLocaleDateString(...)' is a catalogued Date method")
  })

  test.each([
    ["'en-US'", 'a locale only'],
    ["'en-US', {}", 'a locale and an empty options bag'],
    ["'en-US', { month: 'long' }", 'options without a timeZone'],
  ])('toLocaleDateString(%s) on a row (%s) keeps the uncatalogued message, as on a prop', (args) => {
    const row = refusals(rowLoop('Row', `{r.at.toLocaleDateString(${args})}`))
    expect(row).toHaveLength(1)
    expect(row[0].message).toContain('no catalogued lowering')
    // A literal timeZone does not compile a row's call, so the row advice is
    // per-row precompute or client revival only; the prop keeps the rewrite.
    expect(row[0].suggestion).not.toContain('timeZone')
    expect(row[0].suggestion).not.toContain('format_date')
    expect(row[0].suggestion).not.toContain('as a prop')
    expect(row[0].suggestion).toContain('for each row')
    expect(row[0].suggestion).toContain('{/* @client */ new Date(r.at).toLocaleDateString(...)}')
    const prop = refusals(`
      export function Foo(props: { at: Date }) { return <p>{props.at.toLocaleDateString(${args})}</p> }`)
    expect(prop).toHaveLength(1)
    expect(prop[0].message).toContain('no catalogued lowering')
    expect(prop[0].suggestion).toContain('explicit literal timeZone')
    expect(prop[0].suggestion).toContain('format_date')
  })

  test('the suggested literal timeZone really does not compile a row call', () => {
    const errs = refusals(rowLoop('Row', "{r.at.toLocaleDateString('en-US', { timeZone: 'UTC' })}"))
    expect(errs).toHaveLength(1)
    expect(errs[0].suggestion).not.toContain('timeZone')
  })

  test('an uncatalogued call on a nullable row keeps the null-guard advice', () => {
    const errs = refusals(`
      type Row = { at?: Date | null }
      export function Foo(props: { rows: Row[] }) {
        return <ul>{props.rows.map((r) => <li key="k">{r.at?.toLocaleDateString('en-US')}</li>)}</ul>
      }`)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain('no catalogued lowering')
    expect(errs[0].suggestion).toContain('under the same null check the optional chain makes')
    expect(errs[0].suggestion).not.toContain('new Date(r.')
    expect(errs[0].suggestion).not.toContain('timeZone')
  })

  test('a Date of unknown inherited type read through a row gets row advice, not a prop fix', () => {
    const errs = refusals(`
      import type { Base } from './base'
      interface Row extends Base { id: string }
      export function Foo(props: { rows: Row[] }) {
        return <ul>{props.rows.map((r) => <li key="k">{r.at.getTime()}</li>)}</ul>
      }`)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain("Field 'at' is not declared")
    expect(errs[0].message).not.toContain("rop 'at'")
    expect(errs[0].suggestion).not.toContain('Declare')
    expect(errs[0].suggestion).toContain('for each row')
    expect(errs[0].suggestion).not.toContain('as a prop')
    expect(errs[0].suggestion).toContain('{/* @client */ new Date(r.at).getTime()}')
  })

  test.each([
    ['Map<string, string>', "{r.m.get('k')}", false],
    ['URL', '{r.m.toString()}', true],
  ])('a %s row field gets the per-row escapes', (type, body, revivable) => {
    const errs = refusals(`
      export function Foo(props: { rows: { m: ${type} }[] }) {
        return <ul>{props.rows.map((r) => <li key="k">${body}</li>)}</ul>
      }`)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain('no catalogued lowering')
    expect(errs[0].suggestion).toContain('for each row')
    expect(errs[0].suggestion).not.toContain('as a prop')
    expect(errs[0].suggestion.includes('{/* @client */ new URL(r.m)')).toBe(revivable)
  })

  test.each([
    ['{r.at?.getTime()}', "'r.at'"],
    ['{r.meta?.at.getTime()}', "'r.meta.at'"],
  ])('a nullable row read %s keeps its null guard in the advice instead of an unguarded rewrite', (body, path) => {
    const errs = refusals(`
      type Row = { at?: Date | null; meta?: { at: Date } }
      export function Foo(props: { rows: Row[] }) {
        return <ul>{props.rows.map((r) => <li key="k">${body}</li>)}</ul>
      }`)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain(`${path} is read through the loop row binding 'r'`)
    expect(errs[0].suggestion).toContain('under the same null check the optional chain makes')
    expect(errs[0].suggestion).not.toContain('new Date(r.')
  })

  test('an uncatalogued or ambient-locale call on a row keeps the uncatalogued message', () => {
    expect(refusals(rowLoop('Row', '{r.at.getDay()}'))[0].message).toContain('no catalogued lowering')
    expect(refusals(rowLoop('Row', '{r.at.toLocaleDateString()}'))[0].message).toContain('no catalogued lowering')
  })

  test('a prop read inside a loop row still lowers', () => {
    expect(
      refusals(`
        export function Foo(props: { rows: { id: string }[]; at: Date }) {
          return <ul>{props.rows.map((r) => <li key={r.id}>{props.at.getUTCFullYear()}</li>)}</ul>
        }`),
    ).toHaveLength(0)
  })
})
