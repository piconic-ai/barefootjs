import { expect, test } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

for (const tag of ['span', 'a'.repeat(20_000)]) {
  test(`conditional fragment with a ${tag.length}-character tag keeps range markers`, () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function LongRoot() {
  const [shown] = createSignal(true)
  return <div>{shown() ? <><${tag}>first</${tag}><b>last</b></> : null}</div>
}`
    const result = compileJSX(source, 'LongRoot.tsx', { adapter: new GoTemplateAdapter() })
    expect(result.errors.filter(error => error.severity === 'error')).toEqual([])
    const template = result.files.find(file => file.type === 'markedTemplate')!.content
    expect(template).toContain('{{bfComment "cond-start:')
    expect(template).toContain(`<${tag}>first</${tag}><b>last</b>`)
  })
}
