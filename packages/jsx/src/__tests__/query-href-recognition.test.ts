/**
 * `queryHrefLocalNames` — recognises the `queryHref` import (incl. aliases) so
 * adapters can gate the `queryHref(base, { … })` → query-helper lowering (#2042).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, queryHrefLocalNames, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'

function metadata(src: string): ComponentIR['metadata'] {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
  const ir = JSON.parse(result.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return ir.metadata
}

describe('queryHrefLocalNames (#2042)', () => {
  test('recognises a plain queryHref import', () => {
    const md = metadata(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string }) {
  return <a href={queryHref(props.base, {})}>x</a>
}
`)
    expect([...queryHrefLocalNames(md)]).toEqual(['queryHref'])
  })

  test('binds to the local alias', () => {
    const md = metadata(`
'use client'
import { queryHref as qh } from '@barefootjs/client'
export function P(props: { base: string }) {
  return <a href={qh(props.base, {})}>x</a>
}
`)
    expect([...queryHrefLocalNames(md)]).toEqual(['qh'])
  })

  test('recognises the @barefootjs/client/runtime re-export too', () => {
    // `queryHref` is exported from both entries; importing from the runtime entry
    // must still enable SSR lowering, else the call hits BF101.
    const md = metadata(`
'use client'
import { queryHref } from '@barefootjs/client/runtime'
export function P(props: { base: string }) {
  return <a href={queryHref(props.base, {})}>x</a>
}
`)
    expect([...queryHrefLocalNames(md)]).toEqual(['queryHref'])
  })

  test('is empty when not imported', () => {
    const md = metadata(`
'use client'
export function P() { return <a href="/x">x</a> }
`)
    expect(queryHrefLocalNames(md).size).toBe(0)
  })
})
