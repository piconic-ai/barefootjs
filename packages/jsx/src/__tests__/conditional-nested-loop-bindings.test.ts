import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

// The branch collector must retain each inner row's own binding scope,
// independently of whether either source array is reactive.
describe('nested conditional-branch loop binding collection (#3274)', () => {
  for (const signalOuter of [false, true]) {
    for (const signalInner of [false, true]) {
      test(`outer signal=${signalOuter}, inner signal=${signalInner}`, () => {
        const source = `
'use client'
import { createSignal } from '@barefootjs/client'
const GROUPS = ['a', 'b']
const CHOICES = ['1', '2']
export function BranchChoices() {
  const [open] = createSignal(true)
  const [picked] = createSignal('a1')
  const [groups] = createSignal(GROUPS)
  const [choices] = createSignal(CHOICES)
  return <section>{open() ? <div>
    {${signalOuter ? 'groups()' : 'GROUPS'}.map(group => <div key={group}>
      {${signalInner ? 'choices()' : 'CHOICES'}.map(choice =>
        <button key={choice} aria-checked={picked() === group + choice ? 'true' : 'false'}>
          {picked() === group + choice ? 'on' : 'off'}
        </button>)}
    </div>)}
  </div> : null}</section>
}
`
        const result = compileJSX(source, 'BranchChoices.tsx', { adapter: new TestAdapter() })
        expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
        const js = result.files.find(f => f.type === 'clientJs')!.content
        expect(js).toContain('mapArray(() =>')
        expect(js).toContain("setAttribute('aria-checked'")
        expect(js).toContain("insert(__innerEl1_0, 's1', () => picked() === group() + choice()")
        expect(js).toContain('group() + choice()')
      })
    }
  }
})
