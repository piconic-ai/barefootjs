/**
 * What the client reads beyond its named props, decided before the adapter
 * runs (#3845): a destructured prop read only in a `.filter()` predicate
 * reaches the module-scope client template as `_p.<key>`, a closed-type rest
 * key the client reads is in `clientAnalysis.usedRestKeys`, and a spread of
 * a whole caller bag sets `clientAnalysis.readsCallerBag`.
 *
 * The rendered shapes are conformance fixtures (`filter-predicate-on-prefixed-prop`,
 * `rest-spread-root-hydration-props`, …). These pin the name-binding edges
 * the fixtures do not reach: a filter parameter or a loop row named like the
 * prop or the bag.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { isHydrationPayloadPropName } from '../event-handler-name'
import type { ComponentIR } from '../types'

const adapter = new TestAdapter()

function compile(source: string): { js: string; ir: ComponentIR } {
  const result = compileJSX(source, 'C.tsx', { adapter, outputIR: true })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const js = result.files.find(f => f.type === 'clientJs')!.content
  const irs = result.files.filter(f => f.type === 'ir').map(f => JSON.parse(f.content) as ComponentIR)
  const ir = irs.find(c => c.metadata.componentName === 'C')!
  return { js, ir }
}

/** The `template: (_p) => …` lambda the client registers for `C`. */
function templateLine(js: string): string {
  const line = js.split('\n').find(l => l.includes("hydrate('C'") && l.includes('template: (_p) =>'))
  expect(line).toBeDefined()
  return line!
}

/** Everything the client registers for `C`, including a multi-line template. */
function templateSource(js: string): string {
  const start = js.indexOf("hydrate('C'")
  expect(start).toBeGreaterThanOrEqual(0)
  return js.slice(start)
}

describe('filter predicate in the client template (#3845)', () => {
  test('a destructured prop read in the predicate becomes `_p.<key>`', () => {
    const { js } = compile(`
      'use client'
      export function C({ keys, one }: { keys: string[]; one: string }) {
        return <ul>{keys.filter(k => k === one).map(k => <li key={k}>{k}</li>)}</ul>
      }
    `)
    expect(templateLine(js)).toContain('.filter(k => k === _p.one)')
  })

  test('the predicate parameter keeps its name when a prop shares it', () => {
    const { js } = compile(`
      'use client'
      export function C({ keys, k }: { keys: string[]; k: string }) {
        return <div data-k={k}><ul>{keys.filter(k => k !== '').map(v => <li key={v}>{v}</li>)}</ul></div>
      }
    `)
    expect(templateLine(js)).toContain(".filter(k => k !== '')")
  })

  test('an enclosing row binding named like the prop keeps its name', () => {
    const { js } = compile(`
      'use client'
      export function C({ groups, one }: { groups: { one: string; keys: string[] }[]; one: string }) {
        return (
          <div data-one={one}>
            {groups.map(({ one, keys }) => (
              <ul key={one}>{keys.filter(k => k === one).map(k => <li key={k}>{k}</li>)}</ul>
            ))}
          </div>
        )
      }
    `)
    const line = templateLine(js)
    expect(line).toContain('.filter(k => k === one)')
    expect(line).not.toContain('k === _p.one')
  })

  test('a block body rewrites the outer read and keeps an inner `const` of the same name', () => {
    const { js } = compile(`
      'use client'
      export function C({ keys, one }: { keys: string[]; one: string }) {
        return <ul>{keys.filter(k => {
          const v = one
          if (k === 'a') {
            const one = 'a'
            return k === one
          }
          return k === v
        }).map(k => <li key={k}>{k}</li>)}</ul>
      }
    `)
    const tpl = templateSource(js)
    expect(tpl).toContain('const v = _p.one')
    expect(tpl).toContain("const one = 'a'")
    expect(tpl).toContain('return k === one')
    expect(tpl).not.toContain('const _p.one')
  })

  test('a block body keeps a nested-block `var` hoisted over the whole body', () => {
    const { js } = compile(`
      'use client'
      export function C({ keys, one }: { keys: string[]; one: string }) {
        return <ul>{keys.filter(k => {
          if (k === 'a') {
            var one = 'a'
          }
          return k === one
        }).map(k => <li key={k}>{k}</li>)}</ul>
      }
    `)
    const tpl = templateSource(js)
    expect(tpl).toContain('return k === one')
    expect(tpl).not.toContain('_p.one')
  })
})

describe('client analysis of the hydration payload (#3845)', () => {
  test('closed-type rest keys the client reads are listed', () => {
    const { ir } = compile(`
      'use client'
      export function C({ label, ...rest }: { label: string; tone?: string; size?: string }) {
        return <button {...rest} onClick={() => {}}>{label}</button>
      }
    `)
    expect(ir.metadata.clientAnalysis?.usedRestKeys).toEqual(['tone', 'size'])
    expect(ir.metadata.clientAnalysis?.readsCallerBag).toBe(false)
  })

  test('a whole props-object spread onto a child reads the caller bag', () => {
    const { ir } = compile(`
      'use client'
      function Chip(props: { label: string }) { return <button onClick={() => {}}>{props.label}</button> }
      export function C(props: { label: string }) {
        return <div><Chip {...props} /></div>
      }
    `)
    expect(ir.metadata.clientAnalysis?.readsCallerBag).toBe(true)
  })

  test('a loop row named like the props object is not the caller bag', () => {
    const { ir } = compile(`
      'use client'
      function Chip(p: { label: string }) { return <button onClick={() => {}}>{p.label}</button> }
      export function C(props: { rows: { label: string }[] }) {
        return <div>{props.rows.map((props) => <Chip key={props.label} {...props} />)}</div>
      }
    `)
    expect(ir.metadata.clientAnalysis?.readsCallerBag).toBe(false)
  })
})

describe('isHydrationPayloadPropName', () => {
  test('`on[A-Z]` handlers and `__` plumbing stay out; `on`-prefixed data props travel', () => {
    expect(isHydrationPayloadPropName('onClick')).toBe(false)
    expect(isHydrationPayloadPropName('__instanceId')).toBe(false)
    for (const name of ['on', 'one', 'only', 'once', 'online']) {
      expect(isHydrationPayloadPropName(name)).toBe(true)
    }
  })
})
