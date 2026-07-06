/**
 * Tests for #951: destructured `.map()` callbacks rewrite binding
 * references to `__bfItem().path` at IR emission time.
 *
 * Replaces the #950 body-entry unwrap (`const [, cfg] = __bfItem()`)
 * which froze destructured locals at first render. With the rewrite,
 * fine-grained effects read the per-item signal accessor, so same-key
 * setItem updates refresh the DOM.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function compile(source: string, filename: string) {
  return compileJSX(source, filename, { adapter })
}

function getClientJs(source: string, filename: string): string {
  const result = compile(source, filename)
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('destructured .map() param rewriting (#951)', () => {
  test('object destructure: references become __bfItem().property', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [todos, setTodos] = createSignal([{ id: '1', label: 'First', done: false }])
        return (
          <ul onClick={() => setTodos(prev => prev)}>
            {todos().map(({ id, label, done }) => (
              <li key={id} class={done ? 'done' : 'pending'}>{label}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'TodoList.tsx')

    // No entry-point unwrap
    expect(js).not.toContain('const { id, label, done } = __bfItem();')
    // Binding references rewritten to accessor paths
    expect(js).toContain('__bfItem().label')
    expect(js).toContain('__bfItem().done')
    // `id` is referenced ONLY via `key={id}` in this fixture. The loop's
    // `keyFn` argument to `mapArray` evaluates against the raw destructured
    // item (before per-item signal wrapping) — `({ id, label, done }) =>
    // String(id)` — so `id` never needs the `__bfItem()` accessor rewrite at
    // all; `mapArray` stamps the real `data-key` from that keyFn onto every
    // freshly created element itself (see `map-array.ts`). The hoisted
    // shared-template fast path (perf) therefore omits the key interpolation
    // from the once-per-loop skeleton (`data-key=""` placeholder) rather than
    // baking a `__bfItem().id` reference into it — no `__bfItem().id`
    // occurrence anywhere is the CORRECT, not incomplete, output here.
    expect(js).toContain('({ id, label, done }) => String(id)')
  })

  test('tuple destructure with hole: references become __bfItem()[index]', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const chartConfig = { a: { color: 'red' } }

      export function Legend() {
        const [, setFoo] = createSignal(0)
        return (
          <div onClick={() => setFoo(1)}>
            {Object.entries(chartConfig).map(([, cfg]) => (
              <span key={cfg.color}>{cfg.color}</span>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source, 'Legend.tsx')

    expect(js).not.toContain('const [, cfg] = __bfItem();')
    expect(js).toContain('__bfItem()[1].color')
  })

  test('tuple destructure with both elements: references use positional paths', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Pairs() {
        const [pairs, setPairs] = createSignal<[string, number][]>([['a', 1]])
        return (
          <ul onClick={() => setPairs(p => p)}>
            {pairs().map(([label, count]) => (
              <li key={label}>{label}:{count}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'Pairs.tsx')

    expect(js).toContain('__bfItem()[0]')
    expect(js).toContain('__bfItem()[1]')
    expect(js).not.toContain('const [label, count] = __bfItem();')
  })

  test('renamed object destructure: path uses the property key, not the local name', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Aliased() {
        const [items, setItems] = createSignal([{ foo: 'A' }])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ foo: bar }) => (
              <li key={bar}>{bar}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'Aliased.tsx')

    // The local name `bar` is rewritten to the item accessor's `.foo` path.
    expect(js).toContain('__bfItem().foo')
    expect(js).not.toContain('const { foo: bar } = __bfItem();')
  })

  test('nested destructure: path walks through intermediate keys', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Profiles() {
        const [items, setItems] = createSignal([{ user: { name: 'Ada' } }])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ user: { name } }) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'Profiles.tsx')

    expect(js).toContain('__bfItem().user.name')
    expect(js).not.toContain('const { user: { name } } = __bfItem();')
  })

  test('binding name appearing in a string literal is not rewritten', () => {
    // The string-context-aware replacement in wrapLoopParamAsAccessor
    // must leave bare occurrences inside single/double/backtick string
    // literals alone.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Badges() {
        const [items, setItems] = createSignal([{ label: 'A' }])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ label }) => (
              <li key={label} title="label">{label}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'Badges.tsx')

    // The title attribute value is a string literal "label" — must not be
    // rewritten to "__bfItem().label".
    expect(js).toContain('title="label"')
    expect(js).toContain('__bfItem().label')
  })

  test('object rest in destructure lowers to a residual-object accessor', () => {
    // Pre-#1244 fix this combination raised BF025 and bailed out of
    // destructure rewriting; rest props are now lifted into a per-item
    // accessor that subtracts the explicitly destructured sibling keys
    // (`a` here), so a spread back onto the root forwards everything else.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function RestUser() {
        const [items, setItems] = createSignal<{ a: number; b: number; c: number }[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ a, ...rest }) => (
              <li key={a} {...rest}>{a}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compile(source, 'RestUser.tsx')
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')?.content ?? ''

    // `a` keeps the existing fixed-binding rewrite, and `rest` is rebuilt
    // at each read site from `__bfItem()` minus the destructured keys.
    expect(js).toContain('__bfItem().a')
    expect(js).toContain('(({ a: __bfR0, ...__bfRest }) => __bfRest)(__bfItem())')
    // The body-entry `const { a, ...rest } = __bfItem();` unwrap from the
    // legacy #950 path is intentionally absent — accessors are inlined.
    expect(js).not.toContain('const { a, ...rest } = __bfItem();')
  })

  test('array rest in destructure lowers to `.slice(n)`', () => {
    // Array rest in a tuple destructure used to also raise BF025. It now
    // lowers each `tail` reference into `__bfItem().slice(n)` using the
    // native array method, no runtime helper required.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function RestTuple() {
        const [items, setItems] = createSignal<[string, ...string[]][]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(([first, ...tail]) => (
              <li key={first}>{first} (+{tail.length})</li>
            ))}
          </ul>
        )
      }
    `
    const result = compile(source, 'RestTuple.tsx')
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')?.content ?? ''

    expect(js).toContain('__bfItem()[0]')
    expect(js).toContain('__bfItem().slice(1)')
    expect(js).not.toContain('const [first, ...tail] = __bfItem();')
  })

  test('nested array-rest inside an object destructure also lowers', () => {
    // `{ rows: [first, ...tail] }` is the surfaced shape from PR #1306. The
    // outer object destructure walks into `.rows`; the inner array
    // destructure rewrites `first` to `__bfItem().rows[0]` and `tail` to
    // `__bfItem().rows.slice(1)`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Group = { id: string; rows: { id: string; label: string }[] }
      export function Demo() {
        const [groups, setGroups] = createSignal<Group[]>([])
        return (
          <ul onClick={() => setGroups(g => g)}>
            {groups().map(({ id, rows: [first, ...rest] }) => (
              <li key={id}>{first ? first.label : ''} (+{rest.length})</li>
            ))}
          </ul>
        )
      }
    `
    const result = compile(source, 'Demo.tsx')
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')?.content ?? ''

    expect(js).toContain('__bfItem().rows[0]')
    expect(js).toContain('__bfItem().rows[0].label')
    expect(js).toContain('__bfItem().rows.slice(1)')
  })

  test('array rest with leading holes uses the element-position index for slice', () => {
    // `[, , ...tail]` has two omitted slots before the rest. The `from`
    // index recorded in the IR must reflect the rest's position in the
    // element list (2 here), not the count of named bindings (0). Lowering
    // to `__bfItem().slice(2)` is what matches the native destructure's
    // observable shape — `tail.length === item.length - 2`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function HoleRest() {
        const [items, setItems] = createSignal<string[][]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(([, , ...tail], idx) => (
              <li key={idx}>{tail.length}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compile(source, 'HoleRest.tsx')
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')?.content ?? ''

    expect(js).toContain('__bfItem().slice(2)')
  })

  test('object rest with a non-identifier sibling key quotes it in the IIFE pattern', () => {
    // `'data-priority'` is not a valid IdentifierName, so the destructure
    // pattern must quote it. Classification is precomputed at IR-build
    // time via `RestExcludeKey.isIdent`, not re-derived in the emitter.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; 'data-priority': string; flag: string }
      export function HyphenKey() {
        const [items, setItems] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ id, 'data-priority': prio, ...rest }) => (
              <li key={id} {...rest}>{prio}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compile(source, 'HyphenKey.tsx')
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')?.content ?? ''

    // The non-identifier key is rendered as a quoted property name in the
    // destructure pattern, while the identifier keys stay bare.
    expect(js).toContain('(({ id: __bfR0, "data-priority": __bfR1, ...__bfRest }) => __bfRest)(__bfItem())')
  })

  test('computed property key in destructure still raises BF025', () => {
    // Computed keys have no static path to lower to, so the BF025 escape
    // hatch is preserved.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const KEY = 'a' as const
      export function Computed() {
        const [items, setItems] = createSignal<Record<string, number>[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ [KEY]: v }) => <li key={v}>{v}</li>)}
          </ul>
        )
      }
    `
    const result = compile(source, 'Computed.tsx')
    const errs = result.errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_DESTRUCTURE_REST)
    expect(errs.length).toBe(1)
    expect(errs[0].severity).toBe('error')
  })

  test('event delegation lands on a plain local before destructuring (TDZ-safe)', () => {
    // Pre-#951 shape was `const { id } = arr.find(item => String(id) === key)`,
    // which throws a TDZ ReferenceError on the find callback's reference to
    // the outer `id` (still being declared). With binding info available, the
    // delegation emitter rewrites the key to use `item.<path>` and lands on a
    // plain `__bfLoopItem` sentinel before destructuring.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ClickToggle() {
        const [todos, setTodos] = createSignal([{ id: '1', label: 'a' }])
        const toggle = (id: string) => setTodos(p => p)
        return (
          <ul>
            {todos().map(({ id, label }) => (
              <li key={id} onClick={() => toggle(id)}>{label}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'ClickToggle.tsx')

    // Key lookup runs under `item.id`, not under the binding name.
    expect(js).toContain('String(item.id)')
    // Sentinel local precedes the destructure — no TDZ.
    expect(js).toContain('const __bfLoopItem =')
    expect(js).toContain('const { id, label } = __bfLoopItem')
    // The raw handler is preserved so `toggle(id)` closes over the local `id`.
    expect(js).toContain('toggle(id)')
  })

  test('reactive attr inside destructured loop (issue #951 repro)', () => {
    // Class attribute reads the destructured `done` binding. Before
    // #951, the compiled createEffect read a frozen local captured at
    // first render, so same-key `setItem` updates left the class stale.
    // After #951, the effect reads `__bfItem().done` and refreshes.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Toggler() {
        const [todos, setTodos] = createSignal([{ id: '1', done: false }])
        return (
          <ul>
            {todos().map(({ id, done }) => (
              <li key={id} class={done ? 'done' : ''}>{id}</li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'Toggler.tsx')

    // Reactive class attribute reads the accessor for `done`.
    expect(js).toContain('__bfItem().done')
    // No body-entry unwrap.
    expect(js).not.toContain('const { id, done } = __bfItem();')
  })

  test('mapPreamble in block-body callback rewrites binding refs', () => {
    // Block-body `.map` callbacks put statements before the return in a
    // `mapPreamble`. Those statements must also participate in the
    // binding-path rewrite so locals they derive from the destructured
    // bindings stay reactive.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Combined() {
        const [items, setItems] = createSignal([{ label: 'A', value: '1' }])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ label, value }) => {
              const combined = \`\${label}:\${value}\`
              return <li key={value}>{combined}</li>
            })}
          </ul>
        )
      }
    `
    const js = getClientJs(source, 'Combined.tsx')

    // In the CSR mapPreamble, `label` and `value` should be rewritten.
    expect(js).toContain('__bfItem().label')
    expect(js).toContain('__bfItem().value')
  })
})
