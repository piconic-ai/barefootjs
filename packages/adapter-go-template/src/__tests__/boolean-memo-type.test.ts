/**
 * #3512: whether an untyped memo's Go field is `bool` is read from the
 * memo's parsed body, not by a regex over its computation text. A comparison
 * only makes the memo boolean when it is the result; a comparison in a
 * ternary's test, a callback argument or a string does not.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function memoField(body: string): string {
  const src = `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function T(props: { items: any; sel: any; on: boolean }) {
  const [n, setN] = createSignal(0)
  const [flag] = createSignal(false)
  const m = createMemo(() => ${body})
  return <button onClick={() => setN(n() + 1)}>{m()}</button>
}
`
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const { types } = adapter.generate(JSON.parse(irFile.content) as ComponentIR)
  const field = types.match(/^\s+M (\S+)/m)
  if (!field) throw new Error(`no M field in:\n${types}`)
  return field[1]
}

describe('isBooleanMemo reads the parsed body (#3512)', () => {
  test.each([
    "props.sel === 'b'",
    '!props.sel',
    "props.sel === 'b' && props.items.length > 0",
    "props.sel === 'b' ? flag() : props.on",
  ])('%s is bool', (body) => {
    expect(memoField(body)).toBe('bool')
  })

  test.each([
    "props.sel === 'b' ? props.items.length : n()",
    'props.items.findIndex((i: any) => i === props.sel)',
    "props.sel === 'b' ? 'yes' : 'no'",
  ])('%s is not bool', (body) => {
    expect(memoField(body)).not.toBe('bool')
  })
})
