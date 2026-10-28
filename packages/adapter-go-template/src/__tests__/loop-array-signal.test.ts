/**
 * `loopArraySignal`: which component signal a nested-component loop ranges
 * over, the decision the constructor's forwarded-children rows, the wrapper's
 * datum fields and its scalar `BfLoopItem` all read
 * (`signal-loop-row-child-children*` fixtures).
 */

import { describe, expect, test } from 'bun:test'
import { compileFixtureJSX } from '@barefootjs/adapter-tests/harness-program'
import type { ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { findNestedComponents, loopArraySignal } from '../adapter/analysis/component-tree'

const CHIP = `
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}
`

function compileIR(body: string): ComponentIR {
  const source = `'use client'\nimport { createSignal, createMemo } from '@barefootjs/client'\n${CHIP}\n${body}`
  const result = compileFixtureJSX(source, 'component.tsx', { adapter: new GoTemplateAdapter(), outputIR: true })
  const irs = result.files.filter(f => f.type === 'ir').map(f => JSON.parse(f.content) as ComponentIR)
  const ir = irs.find(i => i.metadata.componentName === 'C')
  if (!ir) throw new Error('no IR for C')
  return ir
}

function sourceSignals(ir: ComponentIR, aliases: ReadonlyMap<string, string> = new Map()): Array<string | null> {
  return findNestedComponents(ir.root).map(n => loopArraySignal(n, ir.metadata.signals, aliases)?.getter ?? null)
}

describe('loopArraySignal', () => {
  test("a bare getter call is the loop's signal", () => {
    const ir = compileIR(`export function C() {
  const [rows] = createSignal([{ id: 'a' }])
  return <p>{rows().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)}</p>
}`)
    expect(sourceSignals(ir)).toEqual(['rows'])
  })

  test("a local alias of the getter resolves to the getter's signal", () => {
    const ir = compileIR(`export function C() {
  const [rows] = createSignal([{ id: 'a' }])
  const alias = rows
  return <p>{alias().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)}</p>
}`)
    expect(sourceSignals(ir)).toEqual([null])
    expect(sourceSignals(ir, new Map([['alias', 'rows']]))).toEqual(['rows'])
  })

  test('an enclosing loop binding that shadows the getter is not the signal', () => {
    const ir = compileIR(`export function C() {
  const [rows] = createSignal([{ id: 'a' }])
  const [groups] = createSignal([{ g: 'x', rows: () => [{ id: 'q' }] }])
  return <div>{groups().map(({ g, rows }) => <section key={g}>{rows().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)}</section>)}</div>
}`)
    expect(sourceSignals(ir)).toEqual([null])
  })

  test("the loop's own row binding of the same name does not shadow its array", () => {
    const ir = compileIR(`export function C() {
  const [rows] = createSignal([{ id: 'a' }])
  return <p>{rows().map((rows) => <Chip key={rows.id}><b>{rows.id}</b></Chip>)}</p>
}`)
    expect(sourceSignals(ir)).toEqual(['rows'])
  })

  test('a memo, or a getter called with arguments, is not a signal source', () => {
    const ir = compileIR(`export function C() {
  const [rows] = createSignal([{ id: 'a' }])
  const shown = createMemo(() => rows())
  return <div>{shown().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)}</div>
}`)
    expect(sourceSignals(ir)).toEqual([null])
  })
})
