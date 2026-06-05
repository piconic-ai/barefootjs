/**
 * Pins the Go template lowering of the `Slot` component's dynamic tag.
 *
 * `Slot` does `const Tag = children.tag; return <Tag …>{…}</Tag>` inside
 * an `if (isValidElement(children)) { … }` block. A naive lowering would:
 *   1. emit `{{template "Tag" .TagSlot0}}` — a template that can never be
 *      registered. Go's html/template escape-walks ALL registered
 *      templates (even dead branches), so the whole render fails with
 *      `no such template "Tag"`.
 *   2. lower `isValidElement(children)` to a bogus `.IsValidElement`
 *      struct-field access (a user type-guard predicate Go can't evaluate).
 *
 * The `dynamicTag` IR flag (jsx-to-ir) plus the call-condition fallback
 * (go-template-adapter) defuse both. This test asserts the *emitted Go
 * template string* carries neither pathology, complementing the full
 * conformance render in `go-template-adapter.test.ts`.
 */

import { describe, test, expect } from 'bun:test'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { compileJSX } from '@barefootjs/jsx'

// The committed SSR-precompiled Slot module the conformance harness feeds
// to Go (`children.tag` dynamic tag inside an isValidElement guard).
const SLOT_SSR = `/** @jsxImportSource hono/jsx */
interface SlotProps { children?: unknown; className?: string; [key: string]: unknown }
function isValidElement(element: unknown): element is { tag: unknown; props: Record<string, unknown> } {
  return !!(element && typeof element === 'object' && 'tag' in element && 'props' in element)
}
export function Slot({ children, className, ...props }: SlotProps) {
  if (children && isValidElement(children)) {
    const Tag = children.tag as any
    const childProps = children.props
    const childClass = (childProps.className as string) || ''
    const childChildren = childProps.children
    const mergedClass = [className, childClass].filter(Boolean).join(' ')
    return <Tag {...childProps} {...props} className={mergedClass || undefined}>{childChildren}</Tag>
  }
  return <>{children}</>
}
`

describe('Slot dynamic-tag Go lowering', () => {
  test('emitted Go template has no `{{template "Tag"` call and no `.IsValidElement` field', () => {
    const adapter = new GoTemplateAdapter()
    const result = compileJSX(SLOT_SSR, 'slot.tsx', { adapter, componentName: 'Slot' })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).not.toContain('{{template "Tag"')
    expect(template.content).not.toContain('.IsValidElement')
  })

  test('`isValidElement(children)` lowers to a real truthiness check — no diagnostic, no forced literal', () => {
    const adapter = new GoTemplateAdapter()
    const result = compileJSX(SLOT_SSR, 'slot.tsx', { adapter, componentName: 'Slot' })
    // The guard evaluates faithfully on Go (element ⟺ has children to render),
    // so there is neither an error nor an ignorable warning, and the condition
    // is a real `.Children` truthiness check rather than a fudged literal.
    expect(result.errors).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')!
    expect(template.content).toContain('.Children')
  })

  test('a non-isValidElement user predicate (e.g. `isAdmin`) is a hard BF102 error, not a silent literal', () => {
    const SRC = `/** @jsxImportSource hono/jsx */
declare function isAdmin(u: unknown): boolean
export function Gate({ user }: { user?: unknown }) {
  return <div>{isAdmin(user) ? <span>secret</span> : null}</div>
}
`
    const adapter = new GoTemplateAdapter()
    const result = compileJSX(SRC, 'gate.tsx', { adapter, componentName: 'Gate' })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(
      errors.some(e => e.code === 'BF102' && /cannot be evaluated/i.test(e.message))
    ).toBe(true)
  })
})
