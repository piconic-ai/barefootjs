/**
 * Memo/effect dependency extraction must read the token stream, not the raw
 * body text: a doc comment (or string literal) mentioning `otherSignal()`
 * inside a computation body is not a read and must not become a dependency.
 *
 * Regression pin for the phantom deps surfaced in #2581's review: slider's
 * `percentage` memo gained `internalValue`/`controlledValue` deps in the
 * regenerated `ui/meta/slider.json` purely because an explanatory comment
 * inside the memo body named those getters in call syntax.
 */
import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'

describe('dependency extraction ignores comments and strings', () => {
  test('a comment naming another getter in call syntax is not a dep', () => {
    const source = `
      "use client"
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Slider() {
        const [internalValue, setInternalValue] = createSignal(0)
        const [controlledValue, setControlledValue] = createSignal<number | undefined>(undefined)
        const [min, setMin] = createSignal(0)
        const [max, setMax] = createSignal(100)
        const currentValue = createMemo(() => controlledValue() ?? internalValue())
        const percentage = createMemo(() => {
          if (max() <= min()) return 0
          // \`currentValue()\` mirrors \`controlledValue()\` and \`internalValue()\`
          // in its type, so assert what's runtime-guaranteed.
          return Math.max(0, Math.min(100, ((currentValue()! - min()) / (max() - min())) * 100))
        })
        return <div style={\`width: \${percentage()}%\`}>{currentValue()}</div>
      }
    `
    const ctx = analyzeComponent(source, 'Slider.tsx')
    const percentage = ctx.memos.find(m => m.name === 'percentage')
    expect(percentage).toBeDefined()
    expect(percentage!.deps.sort()).toEqual(['currentValue', 'max', 'min'])
  })

  test('a string literal naming a getter in call syntax is not a dep', () => {
    const source = `
      "use client"
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Label() {
        const [count, setCount] = createSignal(0)
        const [label, setLabel] = createSignal('x')
        const hint = createMemo(() => label() + ' (see count() for the number)')
        return <span>{hint()}</span>
      }
    `
    const ctx = analyzeComponent(source, 'Label.tsx')
    const hint = ctx.memos.find(m => m.name === 'hint')
    expect(hint).toBeDefined()
    expect(hint!.deps).toEqual(['label'])
  })

  test('a read AFTER a template-literal substitution still registers', () => {
    // Trap for token-scan implementations: without a parser driving
    // `reScanTemplateToken`, the template tail after `\${...}` is mis-lexed
    // as a new template opener and swallows the following statement —
    // xyflow's `visibleClass` shape, where `animated()` follows a
    // substitution line and silently lost its dep.
    const source = `
      "use client"
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Edge() {
        const [selected, setSelected] = createSignal(false)
        const [animated, setAnimated] = createSignal(false)
        const visibleClass = createMemo(() => {
          let cls = 'edge'
          if (selected()) cls += \` \${'edge-selected'}\`
          if (animated()) cls += \` \${'edge-animated'}\`
          return cls
        })
        return <div class={visibleClass()}>x</div>
      }
    `
    const ctx = analyzeComponent(source, 'Edge.tsx')
    const visibleClass = ctx.memos.find(m => m.name === 'visibleClass')
    expect(visibleClass).toBeDefined()
    expect(visibleClass!.deps.sort()).toEqual(['animated', 'selected'])
  })

  test('genuine reads inside template-literal substitutions still register', () => {
    const source = `
      "use client"
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Badge() {
        const [tone, setTone] = createSignal('info')
        const cls = createMemo(() => \`badge badge-\${tone()}\`)
        return <span class={cls()}>x</span>
      }
    `
    const ctx = analyzeComponent(source, 'Badge.tsx')
    const cls = ctx.memos.find(m => m.name === 'cls')
    expect(cls).toBeDefined()
    expect(cls!.deps).toEqual(['tone'])
  })
})
