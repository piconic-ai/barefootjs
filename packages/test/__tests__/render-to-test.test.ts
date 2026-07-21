import { describe, test, expect } from 'bun:test'
import { renderToTest } from '../src/index'

// ---------------------------------------------------------------------------
// renderToTest API behavior (not component-specific)
// ---------------------------------------------------------------------------

describe('className via intermediate variable (#525)', () => {
  test('ternary with template literal + identifier branches', () => {
    const source = `
"use client"

import { createSignal } from '@barefootjs/client'

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

import { createSignal } from '@barefootjs/client'

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

// ---------------------------------------------------------------------------
// Bare `className={cond ? a : b}` ternary resolution (#2354)
//
// A ternary written INLINE in className (no backticks) is an
// `expression`-kind attr, not a structured `template`. Before #2354 the
// `template`-branch ternary handling had no `expression`-branch analogue,
// so `collectClassTokens` fell through to splitting the raw JS source —
// leaking the ternary's own operator tokens (`?`/`:`) and unresolved
// member fragments (`rowClass.active`) into `.classes` as if they were
// class names. These pins keep the structured walk (both arms union,
// member access resolved through the object-literal member-path keys)
// and the no-garbage fallback (`[]` when nothing resolves) from
// regressing.
// ---------------------------------------------------------------------------

describe('bare inline className ternary resolution (#2354)', () => {
  const listSource = (className: string) => `
'use client'
const rowClass = { active: 'row row-active', plain: 'row' }
export function List(props: { items: { id: string; active: boolean }[] }) {
  return (
    <ul>
      {props.items.map((item) => (
        <li key={item.id} className={${className}}>{item.id}</li>
      ))}
    </ul>
  )
}
`

  test('object-property member-access branches resolve to both arms union', () => {
    const li = renderToTest(listSource('item.active ? rowClass.active : rowClass.plain'), 'list.tsx', 'List').find({
      tag: 'li',
    })!
    expect(li.classes).toEqual(['row', 'row-active', 'row'])
    // The ternary's own operator tokens are never class names.
    expect(li.classes).not.toContain('?')
    expect(li.classes).not.toContain(':')
    // Nor are the unresolved expression fragments.
    expect(li.classes).not.toContain('item.active')
    expect(li.classes).not.toContain('rowClass.active')
  })

  test('string-literal branches resolve to both arms union', () => {
    const li = renderToTest(listSource("item.active ? 'row row-active' : 'row'"), 'list.tsx', 'List').find({
      tag: 'li',
    })!
    expect(li.classes).toEqual(['row', 'row-active', 'row'])
  })

  test('bare member access (no ternary) resolves through member-path key', () => {
    const li = renderToTest(listSource('rowClass.active'), 'list.tsx', 'List').find({ tag: 'li' })!
    expect(li.classes).toEqual(['row', 'row-active'])
  })

  test('unresolvable ternary yields [] rather than leaking ?/: operator tokens', () => {
    // Both arms reference members of an object the resolver can't reduce,
    // so neither arm resolves. The result must be empty — never the raw
    // ternary source with its `?`/`:` operator tokens.
    const source = `
'use client'
export function List(props: { items: { id: string; active: boolean; a: { x: string }; b: { y: string } }[] }) {
  return (
    <ul>
      {props.items.map((item) => (
        <li key={item.id} className={item.active ? item.a.x : item.b.y}>{item.id}</li>
      ))}
    </ul>
  )
}
`
    const li = renderToTest(source, 'list.tsx', 'List').find({ tag: 'li' })!
    expect(li.classes).toEqual([])
    expect(li.classes).not.toContain('?')
    expect(li.classes).not.toContain(':')
  })
})

// ---------------------------------------------------------------------------
// Object-literal properties whose value is a template literal (#2360)
//
// #2354's member-path seeding only handled a plain string-literal property
// value (`{ active: 'row row-active' }`) — a property built from a shared
// base-class constant plus a per-variant suffix (`{ active: \`${base}
// row-active\` }`, an extremely common way to compose a small related set
// of class strings) fell through unresolved, silently degrading to `[]`
// rather than the actual class tokens. Found via a real component
// (piconic-ai/sora's ListSidebar) using exactly this shape for every one
// of its per-row state classes.
// ---------------------------------------------------------------------------

describe('object-literal properties as template literals (#2360)', () => {
  test('ternary branches referencing template-literal properties resolve to both arms union', () => {
    const source = `
'use client'
const base = 'row'
const rowClass = { active: \`\${base} row-active\`, plain: \`\${base}\` }
export function List(props: { items: { id: string; active: boolean }[] }) {
  return (
    <ul>
      {props.items.map((item) => (
        <li key={item.id} className={item.active ? rowClass.active : rowClass.plain}>{item.id}</li>
      ))}
    </ul>
  )
}
`
    const li = renderToTest(source, 'list.tsx', 'List').find({ tag: 'li' })!
    expect(li.classes).toEqual(['row', 'row-active', 'row'])
  })

  test('a nested ternary over four template-literal properties resolves every arm (ListSidebar shape)', () => {
    const source = `
'use client'
const listItemBase = 'group flex items-center'
const listItemActiveBg = 'bg-active'
const listItemClass = {
  plain: \`list-item \${listItemBase}\`,
  active: \`list-item is-active \${listItemBase} \${listItemActiveBg}\`,
  renaming: \`list-item is-renaming \${listItemBase}\`,
  activeRenaming: \`list-item is-active is-renaming \${listItemBase} \${listItemActiveBg}\`,
}
export function List(props: { items: { id: string; active: boolean; renaming: boolean }[] }) {
  return (
    <ul>
      {props.items.map((entry) => (
        <li
          key={entry.id}
          className={
            entry.renaming
              ? entry.active
                ? listItemClass.activeRenaming
                : listItemClass.renaming
              : entry.active
                ? listItemClass.active
                : listItemClass.plain
          }
        >{entry.id}</li>
      ))}
    </ul>
  )
}
`
    const li = renderToTest(source, 'list.tsx', 'List').find({ tag: 'li' })!
    for (const token of ['list-item', 'is-active', 'is-renaming', 'group', 'flex', 'items-center', 'bg-active']) {
      expect(li.classes).toContain(token)
    }
    expect(li.classes).not.toContain('?')
    expect(li.classes).not.toContain(':')
  })

  test('a property value that is neither a string nor template literal stays unresolved', () => {
    const source = `
'use client'
const rowClass = { active: 1 + 1, plain: 'row' }
export function List(props: { items: { id: string; active: boolean }[] }) {
  return (
    <ul>
      {props.items.map((item) => (
        <li key={item.id} className={item.active ? rowClass.active : rowClass.plain}>{item.id}</li>
      ))}
    </ul>
  )
}
`
    const li = renderToTest(source, 'list.tsx', 'List').find({ tag: 'li' })!
    // Only the resolvable arm (`rowClass.plain`) contributes.
    expect(li.classes).toEqual(['row'])
  })
})

// ---------------------------------------------------------------------------
// Record<T, string>[key] indexed lookups (#2069)
//
// Long documented as a renderToTest resolution limit, resolved by the
// structured `lookup` template part (PR #2000): `${MAP[KEY]}` against a
// const Record literal expands to the UNION of every case's tokens —
// the framework can't pick a concrete key at IR time, so it surfaces
// all branches and tests assert per-variant tokens with `toContain`.
// These pins keep every declaration flavor of that resolution from
// silently regressing back to the old base-tokens-only behavior.
// ---------------------------------------------------------------------------

describe('Record[key] indexed lookup resolution (#2069)', () => {
  test('module-scope Record referenced through a function-scope template const (Button shape)', () => {
    const source = `
type Size = 'sm' | 'md'
const sizeClasses: Record<Size, string> = { sm: 'h-8 px-3', md: 'h-9 px-4' }
function Badge({ size = 'md' }: { size?: Size }) {
  const cls = \`base-token \${sizeClasses[size]}\`
  return <div className={cls}>x</div>
}
export { Badge }
`
    const div = renderToTest(source, 'badge.tsx').find({ tag: 'div' })!
    expect(div.classes).toContain('base-token')
    // Union semantics: every case's tokens are present.
    expect(div.classes).toContain('h-8')
    expect(div.classes).toContain('px-3')
    expect(div.classes).toContain('h-9')
    expect(div.classes).toContain('px-4')
  })

  test('inline template lookup directly in className', () => {
    const source = `
type Size = 'sm' | 'md'
const sizeClasses: Record<Size, string> = { sm: 'h-8', md: 'h-9' }
function Badge({ size = 'md' }: { size?: Size }) {
  return <div className={\`base-token \${sizeClasses[size]}\`}>x</div>
}
export { Badge }
`
    const div = renderToTest(source, 'badge.tsx').find({ tag: 'div' })!
    expect(div.classes).toContain('h-8')
    expect(div.classes).toContain('h-9')
  })

  test('function-scope Record const', () => {
    const source = `
type Size = 'sm' | 'md'
function Badge({ size = 'md' }: { size?: Size }) {
  const sizeClasses: Record<Size, string> = { sm: 'h-8', md: 'h-9' }
  const cls = \`base-token \${sizeClasses[size]}\`
  return <div className={cls}>x</div>
}
export { Badge }
`
    const div = renderToTest(source, 'badge.tsx').find({ tag: 'div' })!
    expect(div.classes).toContain('h-8')
    expect(div.classes).toContain('h-9')
  })

  test('as const / satisfies declaration flavors both resolve', () => {
    const asConst = `
function Badge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sizeClasses = { sm: 'h-8', md: 'h-9' } as const
  const cls = \`base-token \${sizeClasses[size]}\`
  return <div className={cls}>x</div>
}
export { Badge }
`
    const satisfies = `
type Size = 'sm' | 'md'
const sizeClasses = { sm: 'h-8', md: 'h-9' } satisfies Record<Size, string>
function Badge({ size = 'md' }: { size?: Size }) {
  const cls = \`base-token \${sizeClasses[size]}\`
  return <div className={cls}>x</div>
}
export { Badge }
`
    for (const source of [asConst, satisfies]) {
      const div = renderToTest(source, 'badge.tsx').find({ tag: 'div' })!
      expect(div.classes).toContain('h-8')
      expect(div.classes).toContain('h-9')
    }
  })

  test('two lookups + base const resolve together; dynamic passthrough is dropped', () => {
    const source = `
type V = 'default' | 'secondary'
type S = 'sm' | 'md'
const base = 'inline-flex rounded-md'
const variantClasses: Record<V, string> = { default: 'bg-primary', secondary: 'bg-secondary' }
const sizeClasses: Record<S, string> = { sm: 'h-8', md: 'h-9' }
function Btn({ variant = 'default', size = 'md', className = '' }: { variant?: V; size?: S; className?: string }) {
  const cls = \`\${base} \${variantClasses[variant]} \${sizeClasses[size]} \${className}\`
  return <button className={cls}>x</button>
}
export { Btn }
`
    const btn = renderToTest(source, 'btn.tsx').find({ tag: 'button' })!
    expect(btn.classes).toContain('inline-flex')
    expect(btn.classes).toContain('bg-primary')
    expect(btn.classes).toContain('bg-secondary')
    expect(btn.classes).toContain('h-8')
    expect(btn.classes).toContain('h-9')
    // The `${className}` passthrough can't resolve statically — it must
    // be dropped from .classes, not leak as a literal '${className}' token.
    expect(btn.classes.some(c => c.includes('${'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Default-prop values (#2069)
//
// renderToTest models the component compiled with NO incoming props, so a
// literal destructure default (`{ size = 'md' }`) IS the statically-known
// value of that prop. Bare references resolve to it in attributes,
// template interpolations, and text expressions. Non-literal defaults
// (arrows, computed expressions) stay unresolved by design.
// ---------------------------------------------------------------------------

describe('default-prop value resolution (#2069)', () => {
  test('bare prop refs in attributes resolve to their literal defaults', () => {
    const source = `
function Btn({ type = 'button', label = 'Go', tone = 'ok' }: { type?: string; label?: string; tone?: string }) {
  return <button type={type} aria-label={label} data-state={tone}>x</button>
}
export { Btn }
`
    const btn = renderToTest(source, 'btn.tsx').find({ tag: 'button' })!
    expect(btn.props.type).toBe('button')
    expect(btn.aria.label).toBe('Go')
    expect(btn.dataState).toBe('ok')
  })

  test('number and boolean defaults resolve as their string forms', () => {
    const source = `
function Field({ rows = 3, required = false }: { rows?: number; required?: boolean }) {
  return <textarea rows={rows} data-required={required} />
}
export { Field }
`
    const el = renderToTest(source, 'field.tsx').find({ tag: 'textarea' })!
    expect(el.props.rows).toBe('3')
    expect(el.props['data-required']).toBe('false')
  })

  test('template interpolations over defaulted props resolve', () => {
    const source = `
function Chip({ tone = 'ok' }: { tone?: string }) {
  return <div className={\`chip chip-\${tone}\`}>x</div>
}
export { Chip }
`
    const div = renderToTest(source, 'chip.tsx').find({ tag: 'div' })!
    expect(div.classes).toContain('chip')
    expect(div.classes).toContain('chip-ok')
  })

  test('inline ternary className resolves to the union of both branches', () => {
    // Matches the intermediate-const `valueBranches` union (#525): the
    // framework can't pick a branch at IR time, so both surface.
    const source = `
function Row({ active = false }: { active?: boolean }) {
  return <div className={active ? 'row-on' : 'row-off'}>x</div>
}
export { Row }
`
    const div = renderToTest(source, 'row.tsx').find({ tag: 'div' })!
    expect(div.classes).toContain('row-on')
    expect(div.classes).toContain('row-off')
    // No `{active}` condition placeholder token.
    expect(div.classes.some(c => c.includes('{'))).toBe(false)
  })

  test('bare prop ref in text resolves so findByText sees the zero-props render', () => {
    const source = `
function Note({ label = 'Hello' }: { label?: string }) {
  return <div>{label}</div>
}
export { Note }
`
    const result = renderToTest(source, 'note.tsx')
    expect(result.findByText('Hello')).not.toBeNull()
  })

  test('signal reads keep their source text (wiring stays the assertion surface)', () => {
    const source = `
"use client"
import { createSignal } from '@barefootjs/client'
function Counter() {
  const [count, setCount] = createSignal(0)
  return <span>{count()}</span>
}
export { Counter }
`
    const result = renderToTest(source, 'counter.tsx')
    expect(result.findByText('count()')).not.toBeNull()
  })

  test('non-literal defaults stay unresolved', () => {
    const source = `
function List({ items = [] as string[], format = (s: string) => s }: { items?: string[]; format?: (s: string) => string }) {
  return <ul data-items={items}>x</ul>
}
export { List }
`
    const ul = renderToTest(source, 'list.tsx').find({ tag: 'ul' })!
    // `[]` is not a literal string/number/boolean — the expression text
    // stays, same as before this resolution existed.
    expect(ul.props['data-items']).toBe('items')
  })
})

describe('memos and effects fields', () => {
  test('memos contains memo names from createMemo', () => {
    const source = `
"use client"
import { createSignal, createMemo } from "@barefootjs/client"

function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)
  return <span>{doubled()}</span>
}

export { Counter }
`
    const result = renderToTest(source, 'counter.tsx')
    expect(result.memos).toContain('doubled')
    expect(result.memos).not.toContain('count')
  })

  test('effects counts createEffect calls', () => {
    const source = `
"use client"
import { createSignal, createEffect } from "@barefootjs/client"

function Logger() {
  const [count, setCount] = createSignal(0)
  createEffect(() => { console.log(count()) })
  return <span>{count()}</span>
}

export { Logger }
`
    const result = renderToTest(source, 'logger.tsx')
    expect(result.effects).toBe(1)
  })

  test('memos and effects are empty for stateless components', () => {
    const source = `
function Static() {
  return <span>hello</span>
}

export { Static }
`
    const result = renderToTest(source, 'static.tsx')
    expect(result.memos).toEqual([])
    expect(result.effects).toBe(0)
  })
})

describe('<Async> streaming boundary', () => {
  test('exposes resolved children as a fragment', () => {
    const source = `
function ProductPage() {
  return (
    <div>
      <Async fallback={<p>Loading...</p>}>
        <span>Resolved</span>
      </Async>
    </div>
  )
}

export { ProductPage }
`
    const result = renderToTest(source, 'product-page.tsx')
    const span = result.find({ tag: 'span' })
    expect(span).not.toBeNull()
    expect(span!.text).toBeNull()
    const textChild = span!.children.find(c => c.type === 'text')
    expect(textChild?.text).toBe('Resolved')
  })
})

describe('Error detection', () => {
  test('missing "use client" reports BF001', () => {
    const source = `
import { createSignal } from '@barefootjs/client'

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
