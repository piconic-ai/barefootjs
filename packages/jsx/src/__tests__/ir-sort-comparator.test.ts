import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { sortComparatorFromArrow } from '../expression-parser'

describe('sort().map() / toSorted().map()', () => {
  test('sort((a, b) => a.price - b.price).map() produces sortComparator (asc)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().sort((a, b) => a.price - b.price).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    const ul = ir!
    expect(ul.type).toBe('element')
    if (ul.type === 'element') {
      const loop = ul.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toHaveLength(1)
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].key).toEqual({ kind: 'field', field: 'price' })
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].type).toBe('numeric')
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].direction).toBe('asc')
        expect(loop.sortComparator!.paramA).toBe('a')
        expect(loop.sortComparator!.paramB).toBe('b')
        expect(loop.array).toBe('products()')
      }
    }
  })

  test('toSorted((a, b) => b.price - a.price).map() produces sortComparator (desc)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().toSorted((a, b) => b.price - a.price).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    const ul = ir!
    if (ul.type === 'element') {
      const loop = ul.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toHaveLength(1)
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].key).toEqual({ kind: 'field', field: 'price' })
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].type).toBe('numeric')
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].direction).toBe('desc')
      }
    }
  })

  test('filter().sort().map() produces both filterPredicate and sortComparator', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [todos, setTodos] = createSignal<any[]>([])
        return (
          <ul>
            {todos().filter(t => !t.done).sort((a, b) => a.priority - b.priority).map(t => (
              <li>{t.text}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'TodoList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        expect(loop.filterPredicate).toBeDefined()
        expect(loop.filterPredicate!.param).toBe('t')
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toHaveLength(1)
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].key).toEqual({ kind: 'field', field: 'priority' })
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].type).toBe('numeric')
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys[0].direction).toBe('asc')
        expect(loop.chainOrder).toBe('filter-sort')
        expect(loop.array).toBe('todos()')
      }
    }
  })

  test('sort().filter().map() produces both with correct chainOrder', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [todos, setTodos] = createSignal<any[]>([])
        return (
          <ul>
            {todos().sort((a, b) => a.priority - b.priority).filter(t => !t.done).map(t => (
              <li>{t.text}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'TodoList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        expect(loop.filterPredicate).toBeDefined()
        expect(loop.sortComparator).toBeDefined()
        expect(loop.chainOrder).toBe('sort-filter')
        expect(loop.array).toBe('todos()')
      }
    }
  })

  test('multi-key (||-chain) produces one SortKey per operand', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().sort((a, b) => b.price - a.price || a.name.localeCompare(b.name)).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      expect(loop?.type).toBe('loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'desc' },
          { key: { kind: 'field', field: 'name' }, type: 'string', direction: 'asc' },
        ])
      }
    }
  })

  test('relational ternary comparator lowers to an auto key', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().toSorted((a, b) => a.rank > b.rank ? 1 : -1).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'rank' }, type: 'auto', direction: 'asc' },
        ])
      }
    }
  })

  test('3-way ternary comparator derives direction from the outer comparison', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function NumList() {
        const [nums, setNums] = createSignal<number[]>([])
        return (
          <ul>
            {nums().sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(n => (
              <li>{n}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'NumList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'self' }, type: 'auto', direction: 'asc' },
        ])
      }
    }
  })

  test('arrow block body with single return unwraps to the comparator', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().sort((a, b) => { return a.price - b.price }).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'asc' },
        ])
        // block body unwraps to the returned expression, keeping the
        // @client fallback's synthetic `(a, b) => raw` arrow valid.
        expect(loop.sortComparator!.raw).toBe('a.price - b.price')
      }
    }
  })

  test('leading-equality 3-way ternary (a.f === b.f ? 0 : …) lowers to an auto key', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().toSorted((a, b) => a.rank === b.rank ? 0 : a.rank > b.rank ? 1 : -1).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        // The `=== ? 0` arm is a tie; direction comes from the inner
        // relational ternary (a.rank > b.rank ? 1 : -1 → ascending).
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'rank' }, type: 'auto', direction: 'asc' },
        ])
      }
    }
  })

  test('multi-key mixing a numeric leaf and an auto (ternary) leaf', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().sort((a, b) => a.price - b.price || (a.rank > b.rank ? 1 : -1)).map(p => (
              <li>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'asc' },
          { key: { kind: 'field', field: 'rank' }, type: 'auto', direction: 'asc' },
        ])
      }
    }
  })

  test('complex sort comparator with @client keeps sort in array', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {/* @client */ items().sort((a, b) => a.name.localeCompare(b.name)).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'TodoList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        // @client: sort kept in array string, no sortComparator extracted
        expect(loop.sortComparator).toBeUndefined()
        expect(loop.clientOnly).toBe(true)
        expect(loop.array).toContain('sort')
      }
    }
  })
})

// #2090: `.sort(cb)` / `.toSorted(cb)` where `cb` is a bare identifier
// reference to a same-file arrow/function-declaration comparator, resolved
// through the analyzer's scope machinery (`findLocalConst` /
// `findLocalFunction` in jsx-to-ir.ts) one hop, then fed through the SAME
// `sortComparatorFromArrow` catalogue as an inline comparator — no new
// comparator shapes, no IR schema change.
describe('function-reference sort comparator (#2090)', () => {
  test('const arrow reference, ascending', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        const byPrice = (a, b) => a.price - b.price
        return (
          <ul>
            {products().sort(byPrice).map(p => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'asc' },
        ])
        expect(loop.sortComparator!.paramA).toBe('a')
        expect(loop.sortComparator!.paramB).toBe('b')
        expect(loop.sortComparator!.raw).toBe('a.price - b.price')
        expect(loop.array).toBe('products()')
      }
    }
  })

  test('const arrow reference, descending multi-key (||-chain)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        const byPriceThenName = (a, b) => b.price - a.price || a.name.localeCompare(b.name)
        return (
          <ul>
            {products().sort(byPriceThenName).map(p => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'desc' },
          { key: { kind: 'field', field: 'name' }, type: 'string', direction: 'asc' },
        ])
        expect(loop.sortComparator!.raw).toBe('b.price - a.price || a.name.localeCompare(b.name)')
      }
    }
  })

  test('function-declaration reference with return-block body', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function byPrice(a, b) {
        return a.price - b.price
      }

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        return (
          <ul>
            {products().sort(byPrice).map(p => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'asc' },
        ])
        expect(loop.sortComparator!.paramA).toBe('a')
        expect(loop.sortComparator!.paramB).toBe('b')
        expect(loop.sortComparator!.raw).toBe('a.price - b.price')
      }
    }
  })

  test('.toSorted(ref) resolves the same way as .sort(ref)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        const byPrice = (a, b) => a.price - b.price
        return (
          <ul>
            {products().toSorted(byPrice).map(p => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'asc' },
        ])
      }
    }
  })

  test('component-scope const shadows a module-scope const of the same name', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const byPrice = (a, b) => a.price - b.price

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        const byPrice = (a, b) => b.price - a.price
        return (
          <ul>
            {products().sort(byPrice).map(p => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        // The component-scope binding (descending) wins over the
        // module-scope one (ascending) — distinguishable via `direction`.
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'price' }, type: 'numeric', direction: 'desc' },
        ])
        expect(loop.sortComparator!.raw).toBe('b.price - a.price')
      }
    }
  })

  test('filter().sort(ref).map() resolves the reference in a chain', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [todos, setTodos] = createSignal<any[]>([])
        const byPriority = (a, b) => a.priority - b.priority
        return (
          <ul>
            {todos().filter(t => !t.done).sort(byPriority).map(t => (
              <li key={t.text}>{t.text}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'TodoList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.filterPredicate).toBeDefined()
        expect(loop.sortComparator).toBeDefined()
        expect(loop.chainOrder).toBe('filter-sort')
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'priority' }, type: 'numeric', direction: 'asc' },
        ])
      }
    }
  })

  test('sort(ref).filter().map() resolves the reference in a chain', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [todos, setTodos] = createSignal<any[]>([])
        const byPriority = (a, b) => a.priority - b.priority
        return (
          <ul>
            {todos().sort(byPriority).filter(t => !t.done).map(t => (
              <li key={t.text}>{t.text}</li>
            ))}
          </ul>
        )
      }
    `

    const ctx = analyzeComponent(source, 'TodoList.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.filterPredicate).toBeDefined()
        expect(loop.sortComparator).toBeDefined()
        expect(loop.chainOrder).toBe('sort-filter')
        expect(sortComparatorFromArrow(loop.sortComparator!.arrow)!.keys).toEqual([
          { key: { kind: 'field', field: 'priority' }, type: 'numeric', direction: 'asc' },
        ])
      }
    }
  })
})
