/**
 * Derived-state SSR for the Go adapter (PostList blocker, #1897 follow-up).
 *
 * Capability A: an object-returning block-body memo that derives from
 * `searchParams()` must compute a NON-nil `map[string]interface{}` in
 * `NewXxxProps`, so the template's `.Params.Sort` / `.Params.Tag` field
 * accesses resolve at execute time instead of reading a nil map.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function generate(src: string) {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const ir = JSON.parse(irFile.content) as ComponentIR
  return adapter.generate(ir)
}

describe('Capability A: object-returning searchParams memo → computed map field', () => {
  const SRC = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
const SORT_KEYS = ['date', 'title', 'tag']
const asSortKey = (raw) => (SORT_KEYS.includes(raw) ? raw : 'date')
export function P() {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: asSortKey(sp.get('sort')), tag: sp.get('tag') ?? '' }
  })
  return (
    <div>
      <span>{params().sort}</span>
      <span>{params().tag}</span>
    </div>
  )
}
`

  test('NewProps computes the map instead of nil', () => {
    const { types } = generate(SRC)
    expect(types).not.toContain('Params: nil')
    expect(types).toContain('Params: map[string]interface{}{')
  })

  test('object keys are capitalized to match template field access', () => {
    const { types } = generate(SRC)
    expect(types).toContain('"Sort":')
    expect(types).toContain('"Tag":')
  })

  test('searchParams().get is lowered to the SSR SearchParams field', () => {
    const { types } = generate(SRC)
    expect(types).toContain('in.SearchParams.Get("sort")')
    expect(types).toContain('in.SearchParams.Get("tag")')
  })

  test('module helper asSortKey is inlined with bf.Includes over the const array', () => {
    const { types } = generate(SRC)
    expect(types).toContain('bf.Includes([]string{"date", "title", "tag"}')
  })

  test('template still reads .Params.Sort / .Params.Tag (unchanged field access)', () => {
    const { template } = generate(SRC)
    expect(template).toContain('.Params.Sort')
    expect(template).toContain('.Params.Tag')
  })
})
