/**
 * Rich-type method-call refusal (BF021, #2273).
 *
 * A method call on a prop typed as a built-in host rich type (`Date`,
 * `Map`, …) has no catalogued lowering in any adapter — left unchecked it
 * transliterates into the target template's own syntax and dies at request
 * time. `checkRichTypeMethodCalls` (rich-type-refusal.ts) is wired into
 * `compileJSX` (not the bare analyzer/jsxToIR pipeline other BF021 tests in
 * this directory use), so these tests go through `compileJSX` directly.
 *
 * This suite intentionally exercises the refusal against an EMPTY plugin
 * registry (only the "registry-claimed call is exempt" test opts a plugin
 * back in, and cleans up after itself) — `Date`/`Map`/… calls here must
 * still have no catalogued lowering for the fires/silent split below to mean
 * anything. `bun test` runs every file in one process, and a sibling file
 * that imports the package entry (`../index`) registers the real built-ins
 * (`queryHref`, `date`, #2274) as a global side effect — including `date`,
 * which legitimately claims `.toISOString()`. Snapshot + clear + restore
 * around the whole file so this suite's result never depends on which other
 * test files happened to run first in the same process.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { compileJSX } from '../compiler'
import { ErrorCodes } from '../errors'
import { TestAdapter } from '../adapters/test-adapter'
import { registerLoweringPlugin, __resetLoweringPluginsForTest, getLoweringPlugins, type LoweringPlugin } from '../lowering-registry'

const adapter = new TestAdapter()

let savedPlugins: readonly LoweringPlugin[]
beforeAll(() => {
  savedPlugins = getLoweringPlugins()
  __resetLoweringPluginsForTest([])
})
afterAll(() => {
  __resetLoweringPluginsForTest(savedPlugins)
})

function bf021(source: string, filePath = 'Test.tsx') {
  const result = compileJSX(source, filePath, { adapter })
  return result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
}

describe('rich-type method-call refusal — fires (BF021)', () => {
  test('inline-destructured Date in text position', () => {
    const errors = bf021(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.toISOString()'")
    expect(errors[0].message).toContain("'createdAt'")
    expect(errors[0].message).toContain("'Date'")
  })

  test('props-object member chain in attribute position', () => {
    const errors = bf021(`
      export function Foo(props: { d: Date }) {
        return <div data-year={props.d.getUTCFullYear()} />
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.getUTCFullYear()'")
    expect(errors[0].message).toContain("'props.d'")
    expect(errors[0].message).toContain("'Date'")
  })

  test('named interface Props Date field (typeDefinitions deref)', () => {
    const errors = bf021(`
      interface Props { createdAt: Date }
      export function Foo({ createdAt }: Props) {
        return <div>{createdAt.getFullYear()}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.getFullYear()'")
    expect(errors[0].message).toContain("'createdAt'")
    expect(errors[0].message).toContain("'Date'")
  })

  test('optional-chained call', () => {
    const errors = bf021(`
      export function Foo({ d }: { d: Date | undefined }) {
        return <div>{d?.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.toISOString()'")
  })

  test('Date | null union resolves to Date', () => {
    const errors = bf021(`
      export function Foo({ d }: { d: Date | null }) {
        return <div>{d.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'Date'")
  })

  test('loop-item member (items.map(i => i.at.getTime()))', () => {
    const errors = bf021(`
      export function Foo({ items }: { items: { at: Date }[] }) {
        return <ul>{items.map(i => <li>{i.at.getTime()}</li>)}</ul>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.getTime()'")
    // A loop item is prop-DERIVED but not itself a prop — the message must
    // not call it one (only bare / props-object receivers earn "prop").
    expect(errors[0].message).toContain("on 'i.at'")
    expect(errors[0].message).not.toContain("prop 'i.at'")
    expect(errors[0].message).toContain("'Date'")
  })

  test('renamed destructured prop ({ createdAt: c })', () => {
    const errors = bf021(`
      export function Foo({ createdAt: c }: { createdAt: Date }) {
        return <div>{c.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.toISOString()'")
    expect(errors[0].message).toContain("prop 'c'")
    expect(errors[0].message).toContain("'Date'")
  })

  test('conditional-branch call without @client', () => {
    const errors = bf021(`
      export function Foo({ d }: { d: Date | null }) {
        return <div>{d && <span>{d.toISOString()}</span>}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.toISOString()'")
  })

  test('two distinct receivers at the same expression report separately', () => {
    const errors = bf021(`
      export function Foo({ a, b }: { a: Date; b: Date }) {
        return <div>{a.getTime() + b.getTime()}</div>
      }
    `)
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain("prop 'a'")
    expect(errors[1].message).toContain("prop 'b'")
  })

  test('Date in component-prop position', () => {
    const errors = bf021(`
      function Bar(props: { value: string }) {
        return <div>{props.value}</div>
      }
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <Bar value={createdAt.toISOString()} />
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.toISOString()'")
    expect(errors[0].message).toContain("'createdAt'")
  })

  test('Map.get() (broad host-type list)', () => {
    const errors = bf021(`
      export function Foo({ m }: { m: Map<string, string> }) {
        return <div>{m.get('x')}</div>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'.get()'")
    expect(errors[0].message).toContain("'Map'")
  })

  test('diagnostic carries the @client suggestion', () => {
    const errors = bf021(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toISOString()}</div>
      }
    `)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].suggestion?.message).toContain('@client')
  })
})

describe('rich-type method-call refusal — silent (no BF021)', () => {
  test('/* @client */-prefixed Date call', () => {
    const errors = bf021(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ createdAt.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('/* @client */-wrapped conditional branch', () => {
    const errors = bf021(`
      export function Foo({ d }: { d: Date | null }) {
        return <div>{/* @client */ d && <span>{d.toISOString()}</span>}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('module const sharing a propsType field name (object-props mode)', () => {
    const errors = bf021(`
      const version = 'v1'
      export function Foo(props: { version: Map<string, string> }) {
        return <div>{version.toUpperCase()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('string method on string prop', () => {
    const errors = bf021(`
      export function Foo({ s }: { s: string }) {
        return <div>{s.toUpperCase()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('array method on array prop', () => {
    const errors = bf021(`
      export function Foo({ items }: { items: string[] }) {
        return <div>{items.join(',')}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('untyped receiver (no type annotation)', () => {
    const errors = bf021(`
      export function Foo({ d }) {
        return <div>{d.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('generic type-parameter receiver', () => {
    const errors = bf021(`
      export function Foo<T>({ d }: { d: T }) {
        return <div>{d.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('imported named type receiver', () => {
    const errors = bf021(`
      import type { Widget } from './widget'
      export function Foo({ w }: { w: Widget }) {
        return <div>{w.render()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('signal getter call result (d().toISOString())', () => {
    const errors = bf021(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Foo() {
        const [d, setD] = createSignal(new Date())
        return <div>{d().toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('local-function call (not a member call on the receiver)', () => {
    const errors = bf021(`
      function formatDate(x: Date): string { return x.toString() }
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{formatDate(createdAt)}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('.length non-call access', () => {
    const errors = bf021(`
      export function Foo({ items }: { items: string[] }) {
        return <div>{items.length}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('in-file interface Date shadow', () => {
    const errors = bf021(`
      interface Date { iso: string }
      export function Foo({ d }: { d: Date }) {
        return <div>{d.toISOString()}</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('registry-claimed call is exempt (#2274 seam)', () => {
    const samplePlugin: LoweringPlugin = {
      name: 'sample-date-lowering',
      prepare: () => (callee, _args) =>
        callee.kind === 'member' && !callee.computed && callee.property === 'toISOString'
          ? { kind: 'helper-call', helper: 'isoDate', args: [] }
          : null,
    }
    registerLoweringPlugin(samplePlugin)
    try {
      const errors = bf021(`
        export function Foo({ createdAt }: { createdAt: Date }) {
          return <div>{createdAt.toISOString()}</div>
        }
      `)
      expect(errors).toHaveLength(0)
    } finally {
      __resetLoweringPluginsForTest(getLoweringPlugins().filter((p) => p.name !== 'sample-date-lowering'))
    }
  })
})
