import { describe, test, expect } from 'bun:test'
import { renderToTest } from '../src/index'

// ---------------------------------------------------------------------------
// renderToTest API behavior (not component-specific)
// ---------------------------------------------------------------------------

describe('className via intermediate variable (#525)', () => {
  test('ternary with template literal + identifier branches', () => {
    const source = `
"use client"

import { createSignal } from '@barefootjs/dom'

function MyComponent(props: { extra?: boolean }) {
  const baseClasses = 'flex items-center gap-2'
  const cls = props.extra ? \`\${baseClasses} p-4 font-bold\` : baseClasses
  return <div className={cls}>content</div>
}

export { MyComponent }
`
    const result = renderToTest(source, 'my-component.tsx')
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.classes).toContain('flex')
    expect(div!.classes).toContain('items-center')
    expect(div!.classes).toContain('gap-2')
    expect(div!.classes).toContain('p-4')
    expect(div!.classes).toContain('font-bold')
    // Should NOT contain the variable name
    expect(div!.classes).not.toContain('cls')
    expect(div!.classes).not.toContain('baseClasses')
  })

  test('ternary with string literal branches', () => {
    const source = `
"use client"

import { createSignal } from '@barefootjs/dom'

function Compact(props: { compact?: boolean }) {
  const cls = props.compact ? 'p-2 text-sm' : 'p-4 text-base'
  return <div className={cls}>content</div>
}

export { Compact }
`
    const result = renderToTest(source, 'compact.tsx')
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.classes).toContain('p-2')
    expect(div!.classes).toContain('text-sm')
    expect(div!.classes).toContain('p-4')
    expect(div!.classes).toContain('text-base')
  })

  test('plain identifier alias', () => {
    const source = `
function Label() {
  const sharedClasses = 'text-sm font-medium leading-none'
  const cls = sharedClasses
  return <label className={cls}>Name</label>
}

export { Label }
`
    const result = renderToTest(source, 'label.tsx')
    const label = result.find({ tag: 'label' })
    expect(label).not.toBeNull()
    expect(label!.classes).toContain('text-sm')
    expect(label!.classes).toContain('font-medium')
    expect(label!.classes).toContain('leading-none')
    expect(label!.classes).not.toContain('cls')
  })
})

describe('Error detection', () => {
  test('missing "use client" reports BF001', () => {
    const source = `
import { createSignal } from '@barefootjs/dom'

function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}

export { Counter }
`
    const result = renderToTest(source, 'counter.tsx')
    const errorCodes = result.errors.map(e => e.code)
    expect(errorCodes).toContain('BF001')
  })
})
