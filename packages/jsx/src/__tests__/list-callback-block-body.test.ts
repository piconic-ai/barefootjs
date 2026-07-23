/**
 * `.map()` callbacks with a statement-block body.
 *
 * An if/else-if/else (or switch) chain of JSX returns is LOWERED into a nested
 * conditional — the same representation a ternary map body produces — so the
 * natural multi-branch form works and runs. BF026
 * (UNSUPPORTED_LIST_CALLBACK_BODY) remains only for shapes the chain extractor
 * cannot lower (a preamble `const`/`let` alongside a branching return, or nested
 * control flow inside a branch); those would otherwise leak raw JSX into the
 * client bundle (`Unexpected token '<'` at hydrate) with the build still green.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function compile(source: string, filename = 'Test.tsx') {
  return compileJSX(source, filename, { adapter })
}

function errorsFor(code: string, source: string) {
  return compile(source).errors.filter((e) => e.code === code)
}

function clientJs(source: string): string {
  return compile(source).files.find((f) => f.type === 'clientJs')?.content ?? ''
}

const BF026 = ErrorCodes.UNSUPPORTED_LIST_CALLBACK_BODY

// ---------------------------------------------------------------------------
// Now lowered — the natural multi-branch form works.
// ---------------------------------------------------------------------------

describe('.map() if/switch chains lower to a conditional (no BF026)', () => {
  test('if / if / return chain lowers to a reactive nested conditional', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Block = { kind: string; text: string }
      export function Preview() {
        const [blocks] = createSignal<Block[]>([])
        return (
          <div>
            {blocks().map((block, i) => {
              if (block.kind === 'code') return <pre key={i}>{block.text}</pre>
              if (block.kind === 'quote') return <blockquote key={i}>{block.text}</blockquote>
              return <p key={i}>{block.text}</p>
            })}
          </div>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
    const js = clientJs(source)
    // Reactive conditional inside the loop: the branch condition, every branch
    // tag, and no raw JSX return leaked into the bundle.
    expect(js).toContain('mapArray')
    expect(js).toContain("block().kind === 'code'")
    expect(js).toContain('<pre')
    expect(js).toContain('<blockquote')
    expect(js).toContain('<p')
    expect(js).not.toMatch(/return <(pre|blockquote|p)\b/)
  })

  test('explicit if / else-if / else chain lowers, no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Block = { kind: string; text: string }
      export function Preview() {
        const [blocks] = createSignal<Block[]>([])
        return (
          <div>
            {blocks().map((block, i) => {
              if (block.kind === 'code') {
                return <pre key={i}>{block.text}</pre>
              } else if (block.kind === 'quote') {
                return <blockquote key={i}>{block.text}</blockquote>
              } else {
                return <p key={i}>{block.text}</p>
              }
            })}
          </div>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
    expect(clientJs(source)).not.toMatch(/return <(pre|blockquote|p)\b/)
  })

  test('if-chain with no trailing return (renders nothing when unmatched) lowers, no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Block = { kind: string; text: string }
      export function Preview() {
        const [blocks] = createSignal<Block[]>([])
        return (
          <div>
            {blocks().map((block, i) => {
              if (block.kind === 'code') return <pre key={i}>{block.text}</pre>
              if (block.kind === 'quote') return <blockquote key={i}>{block.text}</blockquote>
            })}
          </div>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
    expect(clientJs(source)).not.toMatch(/return <(pre|blockquote)\b/)
  })

  test('guard clause (early JSX return + trailing return null) lowers, no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { hidden: boolean; label: string }
      export function List() {
        const [rows] = createSignal<Row[]>([])
        return (
          <ul>
            {rows().map((row, i) => {
              if (row.hidden) return <li key={i} className="hidden" />
              return null
            })}
          </ul>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
    expect(clientJs(source)).not.toMatch(/return <li\b/)
  })

  test('switch with default lowers, no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Block = { kind: string; text: string }
      export function Preview() {
        const [blocks] = createSignal<Block[]>([])
        return (
          <div>
            {blocks().map((block, i) => {
              switch (block.kind) {
                case 'code': return <pre key={i}>{block.text}</pre>
                case 'quote': return <blockquote key={i}>{block.text}</blockquote>
                default: return <p key={i}>{block.text}</p>
              }
            })}
          </div>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
    expect(clientJs(source)).not.toMatch(/return <(pre|blockquote|p)\b/)
  })
})

// ---------------------------------------------------------------------------
// Still rejected — shapes the chain extractor cannot lower.
// ---------------------------------------------------------------------------

describe('BF026 — shapes the extractor cannot lower still error (no raw JSX leak)', () => {
  test('a preamble const alongside a branching JSX return raises BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { a: boolean; name: string }
      export function List() {
        const [items] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((item, i) => {
              const label = item.name.toUpperCase()
              if (item.a) return <li key={i} className="a">{label}</li>
              return <li key={i}>{label}</li>
            })}
          </ul>
        )
      }
    `
    const errs = errorsFor(BF026, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
    expect(clientJs(source)).not.toMatch(/return <li\b/)
  })

  test('nested control flow inside a branch raises BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { a: boolean; xs: number[]; id: string }
      export function List() {
        const [items] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((item, i) => {
              if (item.a) {
                let n = 0
                for (const x of item.xs) n += x
                return <li key={i}>{n}</li>
              }
              return <li key={i}>{item.id}</li>
            })}
          </ul>
        )
      }
    `
    const errs = errorsFor(BF026, source)
    expect(errs).toHaveLength(1)
    expect(clientJs(source)).not.toMatch(/return <li\b/)
  })
})

// ---------------------------------------------------------------------------
// Supported forms — no false positives.
// ---------------------------------------------------------------------------

describe('BF026 — supported forms compile clean (no false positives)', () => {
  test('single JSX expression body — no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map((item, i) => <li key={i}>{item}</li>)}</ul>
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
  })

  test('ternary body — no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { done: boolean; id: string }
      export function List() {
        const [items] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((item, i) =>
              item.done ? <li key={i} className="done">{item.id}</li> : <li key={i}>{item.id}</li>
            )}
          </ul>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
  })

  test('JSX as a call argument (createPortal) in a single-return block — no BF026', () => {
    const source = `
      'use client'
      import { createSignal, createPortal } from '@barefootjs/client'
      export function Demo() {
        const [items] = createSignal<{ id: string; body: string }[]>([])
        return (
          <ul>
            {items().map(it => {
              createPortal(<div>{it.body}</div>, document.body)
              return <li key={it.id}>{it.id}</li>
            })}
          </ul>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
  })

  test('non-JSX preamble const + single return — no BF026', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return (
          <ul>
            {items().map((item, i) => {
              const label = item.toUpperCase()
              return <li key={i}>{label}</li>
            })}
          </ul>
        )
      }
    `
    expect(errorsFor(BF026, source)).toHaveLength(0)
  })
})
