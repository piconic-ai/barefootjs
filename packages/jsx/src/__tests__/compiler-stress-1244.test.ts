/**
 * Compiler stress catalog (#1244)
 *
 * Each test compiles one TODO-list pattern from the catalog. Tests fall
 * into two shapes:
 *
 *   1. **Supported** — the compiler accepts the pattern; the test locks
 *      that in by asserting no fatal errors (and sometimes a downstream
 *      marker like `createEffect` / `createMemo` / lack of raw JSX).
 *   2. **Surfaced limitation** — `test.todo`. The body describes what
 *      the compiler *should* do (no fatal errors, expected emit shape),
 *      not what it does today. Each comes with a docstring spelling out
 *      the current rejection or miscompile. When the underlying fix
 *      lands, the implementer drops `.todo` and the assertion as
 *      written runs against the corrected compiler.
 *
 * Layer 1 (compiler unit). Keeps the bisection window small; downstream
 * adapter / runtime tests can build on the patterns the compiler
 * already accepts.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

interface Compiled {
  errors: ReturnType<typeof compileJSX>['errors']
  clientJs: string
  template: string
}

function compile(source: string, filename = 'Stress.tsx'): Compiled {
  const result = compileJSX(source, filename, { adapter })
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
  const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
  return { errors: result.errors, clientJs, template }
}

function expectNoFatalErrors(c: Compiled): void {
  const fatals = c.errors.filter(e => e.severity === 'error')
  if (fatals.length > 0) {
    const dump = fatals.map(e => `${e.code}: ${e.message}`).join('\n  ')
    throw new Error(`unexpected fatal compile errors:\n  ${dump}`)
  }
}

/**
 * Return the body (between the outer `{` and `}`) of the Nth
 * `createEffect(() => { ... })` call in `source`. Uses brace counting
 * so a body that itself contains `{}` is captured correctly. Returns
 * `null` if the Nth occurrence does not exist.
 *
 * Prefer this over `source.match(/createEffect/g)` length: regex token
 * counts also catch the import statement and any structurally-unrelated
 * tokens, which is how the original `style-3-signals` assertion
 * silently over-counted.
 */
function getCreateEffectBody(source: string, index = 0): string | null {
  const marker = 'createEffect(() => {'
  let pos = -1
  for (let i = 0; i <= index; i++) {
    pos = source.indexOf(marker, pos + 1)
    if (pos === -1) return null
  }
  let depth = 1
  let cursor = pos + marker.length
  while (depth > 0 && cursor < source.length) {
    const c = source[cursor]
    if (c === '{') depth++
    else if (c === '}') depth--
    cursor++
  }
  return depth === 0 ? source.slice(pos + marker.length, cursor - 1) : null
}

// ---------------------------------------------------------------------------
// Reactive primitive × binding site
// ---------------------------------------------------------------------------

describe('style={{}} object — multiple signal members', () => {
  // Contract: a `style={{ a: s1(), b: s2(), c: s3() }}` object compiles
  // to one reactive binding per attribute (not per member). The single
  // `createEffect` block's body invokes every signal getter, so the
  // runtime tracker subscribes to each — updating any one of the three
  // signals re-runs the effect and re-applies the full `style` string.
  //
  // The original PR #1306 entry asserted `match(/createEffect|effect\(/g).length >= 3`,
  // expecting one effect per signal-bearing member. That regex also
  // matched the `createEffect` token inside the import statement, and
  // the assertion was based on a per-member-effect model that the
  // compiler does not (and need not) implement: per-attribute effects
  // are equivalently correct because the runtime tracks every signal
  // read during the effect's body. Per-member splitting would be an
  // optimisation, not a correctness fix.
  test('all 3 signals participate in one reactive style update path', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [bg, setBg] = createSignal('red')
        const [fg, setFg] = createSignal('white')
        const [pad, setPad] = createSignal('8px')
        return <div onClick={() => setBg('blue')} style={{ background: bg(), color: fg(), padding: pad() }}>x</div>
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)

    const effectBody = getCreateEffectBody(c.clientJs)
    expect(effectBody).not.toBeNull()
    expect(effectBody!).toContain("setAttribute('style'")
    expect(effectBody!).toContain('bg()')
    expect(effectBody!).toContain('fg()')
    expect(effectBody!).toContain('pad()')

    // No second `createEffect` block: one binding per attribute.
    expect(getCreateEffectBody(c.clientJs, 1)).toBeNull()
  })
})

describe('style={{}} object — computed property name', () => {
  test('computed key with template-literal name from a signal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [tone, setTone] = createSignal('primary')
        const [c, setC] = createSignal('red')
        return <div onClick={() => setTone('secondary')} style={{ [\`--\${tone()}\`]: c() }}>x</div>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('style={{}} object — spread of a signal-derived object', () => {
  test('spread of memo-returned object plus a static member', () => {
    const src = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Demo() {
        const [t, setT] = createSignal(0)
        const base = createMemo(() => ({ background: t() > 0 ? 'red' : 'blue', padding: '8px' }))
        return <div onClick={() => setT(n => n + 1)} style={{ ...base(), color: 'white' }}>x</div>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('className — template literal with nested ternaries', () => {
  test('two-signal nested-ternary template literal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [a, setA] = createSignal(false)
        const [b, setB] = createSignal(false)
        return <div onClick={() => setA(v => !v)} className={\`base \${a() ? 'on' : ''} \${b() ? 'lg' : 'sm'}\`}>x</div>
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    // The class binding has to reactively combine two independent signals.
    expect(c.clientJs).toMatch(/class(Name)?|setAttribute/)
  })
})

describe('className — call to a cva-style helper receiving signal values', () => {
  test('helper return value is used as className', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cva(opts: { size: string; tone: string }): string {
        return 'base ' + opts.size + ' ' + opts.tone
      }
      export function Demo() {
        const [size, setSize] = createSignal('md')
        const [tone, setTone] = createSignal('primary')
        return <button onClick={() => setSize('lg')} className={cva({ size: size(), tone: tone() })}>x</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('reactive attribute + spread targeting same key', () => {
  test('spread vs explicit className — which wins is observable', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [c, setC] = createSignal('on')
        const extra = { className: 'spread-wins' }
        return <div onClick={() => setC('off')} className={c()} {...extra}>x</div>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('event handler that captures a memo', () => {
  test('handler reads memo() — invalidation propagates through closure', () => {
    const src = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(0)
        const doubled = createMemo(() => n() * 2)
        return <button onClick={() => { console.log(doubled()); setN(v => v + 1) }}>{n()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('memo chain depth 5+', () => {
  test('5 chained memos compile and emit', () => {
    const src = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(1)
        const m1 = createMemo(() => n() + 1)
        const m2 = createMemo(() => m1() + 1)
        const m3 = createMemo(() => m2() + 1)
        const m4 = createMemo(() => m3() + 1)
        const m5 = createMemo(() => m4() + 1)
        return <button onClick={() => setN(v => v + 1)}>{m5()}</button>
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    const memoCount = (c.clientJs.match(/createMemo/g) || []).length
    expect(memoCount).toBeGreaterThanOrEqual(5)
  })
})

describe('effect created inside a conditional branch', () => {
  test('createEffect inside a ternary branch — disposal scope', () => {
    const src = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'
      export function Demo() {
        const [show, setShow] = createSignal(true)
        if (show()) {
          createEffect(() => { console.log('on') })
        }
        return <button onClick={() => setShow(v => !v)}>x</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Control-flow combinations
// ---------------------------------------------------------------------------

describe('.map() nested 3+ levels with reactive bindings at every depth', () => {
  test('triple-nested map with per-item event + className', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Cell = { id: string; v: number }
      type Row = { id: string; cells: Cell[] }
      type Sheet = { id: string; rows: Row[] }
      export function Demo() {
        const [sheets, setSheets] = createSignal<Sheet[]>([])
        return (
          <div>
            {sheets().map(sheet => (
              <section key={sheet.id} onClick={() => setSheets(s => s)}>
                {sheet.rows.map(row => (
                  <ul key={row.id} className={\`row-\${row.id}\`}>
                    {row.cells.map(cell => (
                      <li key={cell.id} onClick={() => console.log(cell.v)}>{cell.v}</li>
                    ))}
                  </ul>
                ))}
              </section>
            ))}
          </div>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('conditional inside .map() with different-shape branches', () => {
  test('one branch returns null, other returns element', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { id: string; visible: boolean; label: string }
      export function Demo() {
        const [items, setItems] = createSignal<Item[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (it.visible ? <li key={it.id}>{it.label}</li> : null))}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('logical && returning falsy primitives', () => {
  test('count() && JSX with count() === 0 — must NOT render "0"', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [count, setCount] = createSignal(0)
        return <div onClick={() => setCount(c => c + 1)}>{count() && <span>has items</span>}</div>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('ternary chain depth 4+', () => {
  test('four-arm ternary on a string discriminator', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [k, setK] = createSignal<'a' | 'b' | 'c' | 'd'>('a')
        return (
          <div onClick={() => setK('b')}>
            {k() === 'a' ? <span>A</span> : k() === 'b' ? <b>B</b> : k() === 'c' ? <i>C</i> : <em>D</em>}
          </div>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).not.toContain('<span>A</span>')
    expect(c.clientJs).not.toContain('<em>D</em>')
  })
})

describe('per-item <Provider> — each loop item provides a different context value', () => {
  test('Provider inside a .map() body', () => {
    const src = `
      'use client'
      import { createSignal, createContext } from '@barefootjs/client'
      const ItemCtx = createContext<{ id: string }>({ id: '' })
      function Inner() { return <span>x</span> }
      export function Demo() {
        const [items, setItems] = createSignal<{ id: string }[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (
              <ItemCtx.Provider key={it.id} value={{ id: it.id }}>
                <Inner />
              </ItemCtx.Provider>
            ))}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('3+ nested <Provider>s on one subtree', () => {
  test('three Providers wrapping the same child', () => {
    const src = `
      'use client'
      import { createContext } from '@barefootjs/client'
      const A = createContext<string>('a')
      const B = createContext<string>('b')
      const C = createContext<string>('c')
      function Inner() { return <span>x</span> }
      export function Demo() {
        return (
          <A.Provider value="aa">
            <B.Provider value="bb">
              <C.Provider value="cc">
                <Inner />
              </C.Provider>
            </B.Provider>
          </A.Provider>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('self-referential recursive component depth 5+', () => {
  test('component renders itself with a decremented prop', () => {
    const src = `
      export function Tree({ depth }: { depth: number }) {
        if (depth <= 0) return <span>leaf</span>
        return <div><Tree depth={depth - 1} /></div>
      }
    `
    expectNoFatalErrors(compile(src, 'Tree.tsx'))
  })
})

// ---------------------------------------------------------------------------
// Identifier / scope
// ---------------------------------------------------------------------------

describe('4+ same-name child components as siblings in one loop body', () => {
  test('no explicit key on the inner siblings', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Cell({ v }: { v: number }) { return <td>{v}</td> }
      type Row = { id: string; a: number; b: number; c: number; d: number }
      export function Demo() {
        const [rows, setRows] = createSignal<Row[]>([])
        return (
          <table onClick={() => setRows(r => r)}>
            <tbody>
              {rows().map(r => (
                <tr key={r.id}>
                  <Cell v={r.a} />
                  <Cell v={r.b} />
                  <Cell v={r.c} />
                  <Cell v={r.d} />
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('destructured loop param with rest spread back onto the root', () => {
  test('{ id, title, ...rest } and {...rest} on the root element', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Task = { id: string; title: string; 'data-priority': string; 'data-flag': string }
      export function Demo() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(({ id, title, ...rest }) => (
              <li key={id} {...rest}>{title}</li>
            ))}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })

  // Regression contract for #1244: when an explicit attribute on the
  // loop body root collides with a key inside `rest`, JSX/React semantics
  // say the rightmost wins — `rest` is to the right of the explicit
  // attribute in source order, so `rest.data-priority` must override.
  //
  // HTML's duplicate-attribute parse rule is first-wins. Emitting tokens
  // in source order (`data-priority="medium" ${spreadAttrs(rest)}`) lands
  // a `<li data-priority="medium" data-priority="REST">` in the parsed
  // DOM; the browser keeps `medium` (the first occurrence) and silently
  // inverts the JSX semantics. The fix collapses both into a single
  // `spreadAttrs({"data-priority": "medium", ...rest})` call so JS
  // object-literal evaluation does the rightmost-wins resolution before
  // serialization — the helper emits a single attribute per key.
  //
  // Both emit sites carry the same merge: `mapArray`'s per-item factory
  // (`irToHtmlTemplate`) and the `hydrate(..., { template })` SSR lambda
  // (`generateCsrTemplate`).
  test('CSR emit: spread + colliding explicit attr merge into a single spreadAttrs({...}) call', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Task = { id: string; title: string; 'data-priority': string }
      export function Demo() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(({ id, title, ...rest }) => (
              <li key={id} data-priority="medium" {...rest}>{title}</li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)

    // Inline-token form would be the silently-inverted shape — assert
    // its absence on the loop body root.
    expect(c.clientJs).not.toMatch(/<li[^>]*data-priority="medium"[^>]*\$\{spreadAttrs\(/)

    // Both emit sites (mapArray renderItem + hydrate template lambda)
    // must open `spreadAttrs({` carrying the explicit `"data-priority":
    // "medium"` member. Counting prefixes — rather than a full balanced
    // match — keeps the regex robust against nested destructure
    // patterns (`{ id: __bfR0, title: __bfR1, ...__bfRest }`) inside
    // the IIFE residual accessor on the runtime path.
    const mergePrefixes = c.clientJs.match(/spreadAttrs\(\{"data-priority":\s*"medium"/g)
    expect(mergePrefixes).not.toBeNull()
    expect(mergePrefixes!.length).toBeGreaterThanOrEqual(2)
    // The merge object splices the rest expression so a runtime
    // `data-priority` in rest can override the literal `medium`.
    // Runtime path: IIFE residual accessor. SSR template path: the
    // destructured `rest` local. Both reach the same merge call.
    expect(c.clientJs).toMatch(/spreadAttrs\(\{"data-priority":\s*"medium",\s*\.\.\./)
  })
})

describe('nested destructuring in loop param', () => {
  // The catalog shape (`{ rows: [first, ...rest] }`) exercises the
  // walker recursing into a nested array binding inside an object
  // pattern. The Layer 1 contract is on path accumulation: each
  // binding name lowers to the full `__bfItem()` accessor path,
  // including the array index for the inner element and the
  // `.slice(N)` lowering for the inner array rest.
  test('{ rows: [first, ...rest] } at the loop param emits the full path per binding', () => {
    const src = `
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
    const c = compile(src)
    expectNoFatalErrors(c)
    // `first` walks through `.rows[0]`. Both the bare check and the
    // `.label` member-access continuation must thread through.
    expect(c.clientJs).toContain('__bfItem().rows[0]')
    expect(c.clientJs).toContain('__bfItem().rows[0].label')
    // Array rest at position 1 of `rows` lowers to `.slice(1)`, NOT
    // to a runtime helper.
    expect(c.clientJs).toContain('__bfItem().rows.slice(1)')
    // The naive body-entry unwrap (legacy #950 shape) must NOT appear —
    // accessors are inlined at each read site so same-key signal
    // updates refresh the DOM.
    expect(c.clientJs).not.toContain('const [first, ...rest] = ')
  })

  test('3-level deep object destructure emits the full dotted path', () => {
    // `{ user: { profile: { firstName, lastName } } }` — the walker
    // accumulates `__bfItem().user.profile.firstName` etc. The
    // intermediate `profile` and `user` keys must thread through so a
    // signal update to any path segment refreshes the DOM.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type User = { id: string; user: { profile: { firstName: string; lastName: string } } }
      export function Demo() {
        const [users, setUsers] = createSignal<User[]>([])
        return (
          <ul onClick={() => setUsers(u => u)}>
            {users().map(({ id, user: { profile: { firstName, lastName } } }) => (
              <li key={id}>{firstName} {lastName}</li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toContain('__bfItem().user.profile.firstName')
    expect(c.clientJs).toContain('__bfItem().user.profile.lastName')
  })

  test('rename inside a nested object pattern uses the property key, not the local name', () => {
    // `{ user: { name: userName } }` — the local `userName` reads
    // `__bfItem().user.name` (the source property key), mirroring the
    // flat-rename behaviour at `destructured-map-params.test.ts` line
    // 104 but at a nested depth.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; user: { name: string } }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ id, user: { name: userName } }) => (
              <li key={id}>{userName}</li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    // Renamed local resolves to the SOURCE key path, not the local
    // name — there's no `__bfItem().userName` reference (no such key)
    // and no `__bfItem().user.userName` confusion.
    expect(c.clientJs).toContain('__bfItem().user.name')
    expect(c.clientJs).not.toMatch(/__bfItem\(\)\.userName/)
    expect(c.clientJs).not.toMatch(/__bfItem\(\)\.user\.userName/)
  })

  // Destructured loop param referenced as a shorthand property in an
  // object literal (`style={{ color }}`, `{...{ name }}`, …): the
  // `__bfItem().path` rewrite must NOT land in shorthand position
  // because JS only accepts a bare identifier there. Without
  // expansion the rewrite produces `{ __bfItem().color }` — a
  // SyntaxError that takes down the whole compiled module at parse
  // time, before any runtime code runs.
  //
  // The IR-side preprocessing (`expandShorthandBindings`) walks the
  // expression's TS AST, finds `ShorthandPropertyAssignment` whose
  // name matches a binding, and rewrites the entry to a string-literal
  // key + identifier value (`{ "color": color }`). The subsequent
  // identifier-replacement regex skips string-literal contents, so the
  // key stays as the literal `"color"` while the value-position
  // `color` lowers to `__bfItem().color`.
  //
  // `style={{ color }}` is the most common surface (Tailwind-style
  // dynamic colour bindings on per-item tables / lists) and is the
  // shape this test pins.
  test('shorthand property in object literal lowers via string-key expansion (CSR runtime path)', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; color: string; weight: number }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ id, color, weight }) => (
              <li key={id} style={{ color }}>{weight}</li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)

    // The invalid shorthand form `{ __bfItem().color }` is a SyntaxError;
    // its presence in the emit means the module won't load at all.
    expect(c.clientJs).not.toMatch(/\{\s*__bfItem\(\)\.color\s*\}/)
    // The IR-side expansion uses a string-literal key — the regex
    // pass leaves it intact and rewrites only the value position.
    expect(c.clientJs).toMatch(/\{\s*"color":\s*__bfItem\(\)\.color\s*\}/)
  })

  test('shorthand property survives nested destructure (object-in-array)', () => {
    // Nested: tuple element destructured as object. Same shorthand
    // pitfall as the flat case above — the AST preprocessing finds the
    // shorthand even though the binding path is deeper
    // (`__bfItem()[1].color`).
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Pair = readonly [string, { color: string; weight: number }]
      export function Demo() {
        const [pairs, setPairs] = createSignal<Pair[]>([])
        return (
          <ul onClick={() => setPairs(p => p)}>
            {pairs().map(([label, { color, weight }]) => (
              <li key={label} style={{ color }}>{label} ({weight})</li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)

    expect(c.clientJs).not.toMatch(/\{\s*__bfItem\(\)\[1\]\.color\s*\}/)
    expect(c.clientJs).toMatch(/\{\s*"color":\s*__bfItem\(\)\[1\]\.color\s*\}/)
  })
})

describe('loop param shadowing an outer signal name', () => {
  test('tasks.map(tasks => …) — inner `tasks` shadows outer signal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; title: string }
      export function Demo() {
        const [tasks, setTasks] = createSignal<T[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(tasks => <li key={tasks.id}>{tasks.title}</li>)}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('computed key', () => {
  test('key={hash(item) ?? fallback}', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function hash(s: string): string { return s }
      type T = { id: string; name: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => <li key={hash(it.name) ?? it.id}>{it.name}</li>)}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('key edge values', () => {
  // BF023 (missing-key) used to fire on explicit literal-falsy keys
  // (`key={null}`, `key={undefined}`) and on any ternary chain whose
  // branches reached one of those literals — silently routing what
  // React treats as a runtime warning into a hard compile error with a
  // misleading "missing key" message. The user explicitly wrote the
  // value; treat it as a runtime concern and let `mapArray`'s
  // `String()` coercion produce the per-item key (`"null"`,
  // `"undefined"`, `"0"`, `"false"`). Numeric / boolean keys were
  // always accepted; the relaxation extends the same policy to the
  // `null` / `undefined` literals and to ternaries that mix them.
  //
  // (#1244 catalog "key={0}, key={false}, key={null}".)
  test('key={0} literal accepted as a numeric key', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [items] = createSignal<{ v: number }[]>([])
        return <ul>{items().map(it => <li key={0}>{it.v}</li>)}</ul>
      }
    `
    expectNoFatalErrors(compile(src))
  })

  test('key={false} literal accepted (lowers to "false" at runtime)', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [items] = createSignal<{ v: number }[]>([])
        return <ul>{items().map(it => <li key={false}>{it.v}</li>)}</ul>
      }
    `
    expectNoFatalErrors(compile(src))
  })

  test('key={null} literal accepted (no BF023 false-positive)', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [items] = createSignal<{ v: number }[]>([])
        return <ul>{items().map(it => <li key={null}>{it.v}</li>)}</ul>
      }
    `
    expectNoFatalErrors(compile(src))
  })

  test('key={undefined} literal accepted (no BF023 false-positive)', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [items] = createSignal<{ v: number }[]>([])
        return <ul>{items().map(it => <li key={undefined}>{it.v}</li>)}</ul>
      }
    `
    expectNoFatalErrors(compile(src))
  })

  test('ternary key mixing 0, false, null — accepted', () => {
    // Per-item differentiated key via index. mapArray's `String()`
    // coercion produces `"0"`, `"false"`, `"null"` — distinct strings,
    // so reconciliation behaves as if the user had written explicit
    // index strings.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { v: number }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map((it, i) => (
              <li key={i === 0 ? 0 : i === 1 ? false : null}>{it.v}</li>
            ))}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('component identifier passed as a callback value', () => {
  test('<Outer render={Inner} /> — Inner is a component function value', () => {
    const src = `
      function Inner() { return <span>x</span> }
      function Outer({ render: R }: { render: () => JSX.Element }) {
        return <div><R /></div>
      }
      export function Demo() {
        return <Outer render={Inner} />
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Value-shape edges
// ---------------------------------------------------------------------------

describe('attribute value shape parity', () => {
  test('attr={0} vs "" vs false vs null vs undefined vs omitted compile', () => {
    const src = `
      export function Demo() {
        return (
          <div>
            <span data-a={0}>0</span>
            <span data-b={''}>empty</span>
            <span data-c={false}>false</span>
            <span data-d={null}>null</span>
            <span data-e={undefined}>undefined</span>
            <span>omitted</span>
          </div>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('attr={cond() && "x"} short-circuiting to false', () => {
  test('string-typed attribute with logical-and value', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [cond, setCond] = createSignal(false)
        return <a onClick={() => setCond(v => !v)} title={cond() && 'x'}>link</a>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('boolean attribute with attr={truthy ? "" : undefined}', () => {
  test('empty string is truthy as boolean attribute presence', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [open, setOpen] = createSignal(false)
        return <details onClick={() => setOpen(v => !v)} open={open() ? '' : undefined}>x</details>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('children as an array', () => {
  test('children: [a, b, c] — keyed siblings, dynamic length', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Wrap({ children }: { children: any }) { return <div>{children}</div> }
      export function Demo() {
        const [n, setN] = createSignal(3)
        return (
          <Wrap>
            {[<span key="a">a</span>, <span key="b">b</span>, <span key="c">c</span>]}
          </Wrap>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('children as a function (render-prop)', () => {
  test('children prop is a function receiving signal values', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Resource({ children }: { children: (v: number) => JSX.Element }) {
        return <div>{children(42)}</div>
      }
      export function Demo() {
        const [n, setN] = createSignal(0)
        return <Resource>{(v) => <span onClick={() => setN(v)}>{v + n()}</span>}</Resource>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('dangerouslySetInnerHTML with a reactive value', () => {
  test('reactive innerHTML', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [html, setHtml] = createSignal('<b>hi</b>')
        return <div onClick={() => setHtml('<i>bye</i>')} dangerouslySetInnerHTML={{ __html: html() }} />
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// TS surface / DX
// ---------------------------------------------------------------------------

describe('signal returned from a generic helper', () => {
  // SURFACED LIMITATION (#1244 sub-issue): BF110 currently rejects a
  // *generic* helper (`function useResource<T>(): [() => T, …]`) even
  // when its body is `return createSignal(...)` — the analyzer doesn't
  // follow it through generics. The intended behaviour is to recognise
  // the wrapper the same way the non-generic same-file helper case is
  // already followed. The body asserts a clean compile. Drop `.todo`
  // once fixed.
  test.todo('useResource<T>() return is destructured into a signal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function useResource<T>(initial: T): [() => T, (next: T) => void] {
        return createSignal(initial)
      }
      export function Demo() {
        const [name, setName] = useResource<string>('alice')
        return <button onClick={() => setName('bob')}>{name()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('as const-narrowed signal initial value', () => {
  test('analyzer recognises an `as const` initial', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [k, setK] = createSignal('idle' as const)
        return <button onClick={() => setK('idle')}>{k()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('satisfies between signal initial and a target type', () => {
  test('initial value uses `satisfies`', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Status = 'idle' | 'loading'
      export function Demo() {
        const [s, setS] = createSignal('idle' satisfies Status)
        return <button onClick={() => setS('loading')}>{s()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('discriminated-union props rendering different subtrees per discriminator', () => {
  test('switch on `kind` returns different element shapes', () => {
    const src = `
      type P = { kind: 'a'; a: string } | { kind: 'b'; b: number }
      export function Demo(props: P) {
        if (props.kind === 'a') return <span>A:{props.a}</span>
        return <b>B:{props.b}</b>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('default-prop value that itself reads a signal', () => {
  test('default value is computed from a module-scope @client signal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      /* @client */
      const [global, setGlobal] = createSignal('default')
      export function Demo({ label = global() }: { label?: string }) {
        return <button onClick={() => setGlobal('next')}>{label}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('component returning null vs <></> vs false', () => {
  test('three renderers compile in a single file', () => {
    const src = `
      export function ReturnsNull() { return null }
      export function ReturnsFragment() { return <></> }
      export function ReturnsFalse(): any { return false }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Async / portal / multi-boundary (TODO grid: control-flow + lifecycle)
// ---------------------------------------------------------------------------

describe('<Async> inside .map() — per-item streaming boundary', () => {
  test('async boundary used inside a loop body', () => {
    const src = `
      'use client'
      import { createSignal, Async } from '@barefootjs/client'
      function Card({ id }: { id: string }) { return <span>{id}</span> }
      export function Demo() {
        const [items, setItems] = createSignal<{ id: string }[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (
              <li key={it.id}>
                <Async fallback={<p>loading {it.id}</p>}>
                  <Card id={it.id} />
                </Async>
              </li>
            ))}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('.map() inside <Async> — loop body wired after async chunk lands', () => {
  test('map call inside an async boundary body', () => {
    const src = `
      'use client'
      import { createSignal, Async } from '@barefootjs/client'
      export function Demo() {
        const [items, setItems] = createSignal<{ id: string; label: string }[]>([])
        return (
          <Async fallback={<p>loading</p>}>
            <ul onClick={() => setItems(i => i)}>
              {items().map(it => <li key={it.id}>{it.label}</li>)}
            </ul>
          </Async>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('<Async> body error path — sync throw + async reject (#1375)', () => {
  // Whether the body throws synchronously or rejects asynchronously is a
  // runtime property the compiler can't see. The Layer 1 contract is that
  // neither shape degrades the boundary's compile output: a throwing /
  // rejecting body still produces a well-formed `<Async>` boundary with the
  // fallback preserved, so the adapter has something to fall back to.
  //
  // The boundary's fallback is wired into an error-catching boundary by the
  // adapter: the Hono `renderAsync` emit (see
  // `packages/adapter-hono/src/__tests__/async-error-boundary.test.ts`) and
  // the runtime `BfAsync` component (see
  // `packages/adapter-hono/src/__tests__/async.test.tsx`) both wrap the body
  // in `ErrorBoundary`. The browser-level behaviour (fallback rendered,
  // reset-signal re-mount, throw-during-cleanup) is covered by the Layer 6
  // stubs in `site/ui/e2e/stress-1244.spec.ts`.

  test('synchronously-throwing body component compiles to a clean boundary', () => {
    const src = `
      import { Async } from '@barefootjs/client'
      export function Demo() {
        return (
          <Async fallback={<p>Fallback</p>}>
            <Throws />
          </Async>
        )
      }
    `
    expectNoFatalErrors(compile(src, 'Demo.tsx'))
  })

  test('async (Promise-returning) body component compiles to a clean boundary', () => {
    const src = `
      import { Async } from '@barefootjs/client'
      export function Demo() {
        return (
          <Async fallback={<Skeleton />}>
            <SlowData />
          </Async>
        )
      }
    `
    expectNoFatalErrors(compile(src, 'Demo.tsx'))
  })
})

describe('createPortal inside .map() — per-item portal owner tracking', () => {
  test('one portal created per loop item', () => {
    const src = `
      'use client'
      import { createSignal, createPortal } from '@barefootjs/client'
      export function Demo() {
        const [items, setItems] = createSignal<{ id: string; body: string }[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => {
              createPortal(<div>{it.body}</div>, document.body)
              return <li key={it.id}>{it.id}</li>
            })}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('multiple "use client" boundaries in one tree', () => {
  // A stateless server-rendered shell wraps two independently-stateful
  // child components — server/client mix. Today this needs three
  // physical files (each `'use client'` is per-file). Locking the
  // multi-file shape verifies cross-file scope IDs stay distinct.
  test('parent stateless, two stateful children imported from sibling files', () => {
    const src = `
      import { CounterA } from './a'
      import { CounterB } from './b'
      export function Demo() {
        return (
          <main>
            <CounterA />
            <CounterB />
          </main>
        )
      }
    `
    const result = compileJSX(src, 'Demo.tsx', {
      adapter,
      // Provide stub child files would normally be done via Program;
      // since we can't here, just verify the parent compiles standalone.
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Refs (TODO grid: identifier / scope + reactive primitive)
// ---------------------------------------------------------------------------

describe('two refs on the same element via a composeRefs helper', () => {
  test('ref={composeRefs(refA, refB)}', () => {
    const src = `
      'use client'
      function composeRefs<T>(...refs: ((el: T) => void)[]) {
        return (el: T) => refs.forEach(r => r(el))
      }
      export function Demo() {
        const a = (el: HTMLDivElement) => { void el }
        const b = (el: HTMLDivElement) => { void el }
        return <div ref={composeRefs(a, b)} />
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// #1244 catalog: "ref callback re-invocation when the element re-mounts
// under the same key". Layer 1 — emit-shape contract: every loop variant
// must invoke the user-supplied ref callback inside its per-item factory
// so each renderItem / forEach invocation re-runs the callback (initial
// mount, SSR hydration, same-key remount after unmount). mapArray does
// not call renderItem for same-key reactive updates, so the callback
// does not over-fire on plain prop changes.
//
// The assertion shape `\\battach\\b\\s*(?:\\)\\s*)?\\(` accepts both the
// bare `attach(...)` call form and `(attach)(...)` (the wrapper
// `emitRefCall` applies to bare identifiers for symmetry with the
// optional-call `(_p.cb)?.(...)` form used for prop-access callbacks).
// Whether the call lands inside the right factory (so remount re-fires
// it) is the Layer 6 E2E's job (`ref-remount` fixme in
// `site/ui/e2e/stress-1244.spec.ts`); Layer 1 verifies the callback
// isn't silently dropped on any variant — the failure shape that
// motivated #1244 §B unification.
// ---------------------------------------------------------------------------

describe('ref callback re-invocation on remount under the same key (#1244)', () => {
  const CALL_PATTERN = /\battach\b\s*(?:\)\s*)?\(/

  test('plain top-level .map() — ref on body root invoked', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; label: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => <li key={it.id} ref={attach}>{it.label}</li>)}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('ref on descendant (not body root) — qsa resolves via slot id', () => {
    // `qsa(__el, '[bf="<slot>"]')` matches root-or-descendant, so the ref
    // can attach to any element under the loop body without a special
    // emit shape. The contract: emit still contains the call.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; label: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (
              <li key={it.id}>
                <span ref={attach}>{it.label}</span>
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('composite loop (body contains nested component) emits ref', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge({ tone }: { tone: string }) { return <span>{tone}</span> }
      type T = { id: string; tag: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (
              <li key={it.id} ref={attach}>
                <Badge tone={it.tag} />
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('static-array .map() — ref fires from forEach body', () => {
    // Static arrays use a `forEach((param, idx) => {...})` shape rather
    // than `mapArray`; refs must still be wired there.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo(props: { items: { id: string; label: string }[] }) {
        const [n, setN] = createSignal(0)
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setN(n() + 1)}>
            {props.items.map(it => <li key={it.id} ref={attach}>{it.label}</li>)}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('plain .map() inside conditional branch (BranchLoop kind=plain)', () => {
    // Branch swap creates a new DOM subtree; mapArray's renderItem then
    // re-fires inside `bindEvents`. The ref callback must be emitted
    // inside the disposable-effect-wrapped renderItem body.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; label: string }
      export function Demo() {
        const [show, setShow] = createSignal(true)
        const [items, setItems] = createSignal<T[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <div onClick={() => setShow(v => !v)}>
            {show() && (
              <ul>
                {items().map(it => <li key={it.id} ref={attach}>{it.label}</li>)}
              </ul>
            )}
          </div>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('composite .map() inside conditional branch (BranchLoop kind=composite)', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge({ tone }: { tone: string }) { return <span>{tone}</span> }
      type T = { id: string; tag: string }
      export function Demo() {
        const [show, setShow] = createSignal(true)
        const [items, setItems] = createSignal<T[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <div onClick={() => setShow(v => !v)}>
            {show() && (
              <ul>
                {items().map(it => (
                  <li key={it.id} ref={attach}>
                    <Badge tone={it.tag} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('nested .map().map() — ref on inner item emits inside inner factory', () => {
    // The inner loop has its own renderItem; refs there need their own
    // wiring via the inner-loop stringifier path.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge({ tone }: { tone: string }) { return <span>{tone}</span> }
      type Cell = { id: string; v: number }
      type Row = { id: string; cells: Cell[] }
      export function Demo() {
        const [rows, setRows] = createSignal<Row[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(row => (
              <li key={row.id}>
                <Badge tone={row.id} />
                {row.cells.map(c => <span key={c.id} ref={attach}>{c.v}</span>)}
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(CALL_PATTERN)
  })

  test('multiple refs on one loop body — both callbacks emitted', () => {
    // One ref on the body root, another on a descendant. Each gets its
    // own slot-scoped emit so both must appear in the output.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; label: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        const attachOuter = (el: HTMLElement | null) => { void el }
        const attachInner = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (
              <li key={it.id} ref={attachOuter}>
                <span ref={attachInner}>{it.label}</span>
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(/\battachOuter\b\s*(?:\)\s*)?\(/)
    expect(c.clientJs).toMatch(/\battachInner\b\s*(?:\)\s*)?\(/)
  })

  test('ref callback inline arrow closing over loop param', () => {
    // Inline arrow body references `it.id` — wrapLoopParamAsAccessor
    // rewrites that to `it().id` inside the per-item factory. The
    // contract here is just "the callback survives to the emit" — the
    // closure rewrite is exercised indirectly because dropping the ref
    // would also drop the surrounding `refMap.set(...)` call.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; label: string }
      const refMap = new Map<string, HTMLElement>()
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => (
              <li key={it.id} ref={(el: HTMLElement | null) => { if (el) refMap.set(it.id, el) }}>
                {it.label}
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toContain('refMap.set')
  })

  test('ref present forces multi-line plain-loop layout', () => {
    // Plain loops emit a single-line renderItem when the body has no
    // reactive effects and is single-root. A `ref` carries no reactive
    // effect of its own but still needs `__el` as a stable handle, so
    // it must force the multi-line layout — otherwise there's no place
    // to insert the callback invocation.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; label: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        const attach = (el: HTMLElement | null) => { void el }
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(it => <li key={it.id} ref={attach}>{it.label}</li>)}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    // The multi-line layout uses an explicit `const __el = __existing ?? ...`
    // statement; the single-line layout uses `if (__existing) return __existing`
    // followed by the inline clone. If the ref didn't force multi-line, the
    // emit would short-circuit before any factory body where the callback
    // could fire.
    expect(c.clientJs).toContain('const __el = __existing ??')
  })

  test('prop-array .map(): ref callback closing over loop param uses signal accessor (#1586)', () => {
    // Prop arrays compile to `mapArray` where the item param is a signal
    // accessor. A ref callback closing over the param (e.g.
    // `ref={(el) => map.set(it.id, el)}`) gets rewritten to `it().id`
    // because `it` is a signal accessor in the mapArray renderItem body.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const refMap = new Map<string, HTMLElement>()
      export function Demo(props: { items: { id: string; label: string }[] }) {
        const [n, setN] = createSignal(0)
        return (
          <ul onClick={() => setN(n() + 1)}>
            {props.items.map(it => (
              <li key={it.id} ref={(el: HTMLElement | null) => { if (el) refMap.set(it.id, el) }}>
                {it.label}
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toContain('refMap.set(it().id')
  })

  test('static inner .map() under reactive outer: ref callback closing over inner param stays raw', () => {
    // Outer is signal-backed (composite). Inner is a literal static array
    // — buildStaticEmit handles its per-iteration setup via `forEach`.
    // The inner param `s` is the raw value in `forEach`, so a ref callback
    // closing over `s` must NOT be signal-accessor-wrapped (would emit
    // `s()` and throw at runtime).
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge({ tone }: { tone: string }) { return <span>{tone}</span> }
      const refMap = new Map<string, HTMLElement>()
      export function Demo() {
        const [rows, setRows] = createSignal<{ id: string; tag: string }[]>([])
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(row => (
              <li key={row.id}>
                <Badge tone={row.tag} />
                {['a', 'b', 'c'].map((s, i) => (
                  <em key={i} ref={(el: HTMLElement | null) => { if (el) refMap.set(s, el) }}>{s}</em>
                ))}
              </li>
            ))}
          </ul>
        )
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    expect(c.clientJs).toMatch(/refMap\.set\(\s*s\s*,/)
    expect(c.clientJs).not.toMatch(/refMap\.set\(\s*s\(\)/)
  })
})

// ---------------------------------------------------------------------------
// Spread / value shape (TODO grid: value-shape edges)
// ---------------------------------------------------------------------------

describe('JSX spread of a reactive object', () => {
  test('<div {...signal()} /> — every key from the object must rebind on update', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [attrs, setAttrs] = createSignal<Record<string, string>>({ id: 'a', class: 'on' })
        return <div onClick={() => setAttrs(a => a)} {...attrs()} />
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('tagged template literal for className', () => {
  // `cn\`base ${signal()}\`` is the most common alternative to `cva` in
  // small codebases. Resolved by #2092: `cn`'s body structurally matches
  // the interleave-tag catalogue (`parts.reduce((acc, p, i) => acc + p +
  // (args[i] ?? ''), '')`), so the tagged template desugars to the
  // equivalent untagged template literal — the signal dependency inside
  // the placeholder IS analysed, producing a reactive className binding.
  test('cn`base ${signal()}` produces the className binding', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]) {
        return parts.reduce((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function Demo() {
        const [tone, setTone] = createSignal('primary')
        return <div onClick={() => setTone('secondary')} className={cn\`base \${tone()}\`} />
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    // The tag call is gone from the emitted client JS — replaced by the
    // desugared untagged template literal — and the className update
    // effect reads the signal getter reactively.
    expect(c.clientJs).not.toMatch(/\bcn`/)
    expect(c.clientJs).toContain('`base ${(tone()) ?? \'\'}`')
    expect(c.clientJs).toMatch(/setAttribute\('class',\s*String\(__v\)\)/)
  })
})

// ---------------------------------------------------------------------------
// Nested reactive primitives (TODO grid: reactive primitive × lifecycle)
// ---------------------------------------------------------------------------

describe('createEffect inside createMemo', () => {
  // A memo's body is a derivation, not a scope owner — creating an
  // effect inside it leaks the effect on every memo recomputation.
  // The compiler should at minimum diagnose this; today there's no
  // dedicated check.
  test('memo body creating an effect compiles', () => {
    const src = `
      'use client'
      import { createSignal, createMemo, createEffect } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(0)
        const m = createMemo(() => {
          createEffect(() => { console.log(n()) })
          return n() * 2
        })
        return <button onClick={() => setN(v => v + 1)}>{m()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('createSignal inside createEffect', () => {
  // Creating a signal inside an effect re-creates it on every run, so
  // identity churns and downstream effects re-subscribe. The compiler
  // should at minimum diagnose this; today there's no dedicated check.
  test('effect body creating a signal compiles', () => {
    const src = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(0)
        createEffect(() => {
          const [inner] = createSignal(n())
          console.log(inner())
        })
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('onMount returning a cleanup function', () => {
  test('return from onMount is registered as cleanup', () => {
    const src = `
      'use client'
      import { createSignal, onMount } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(0)
        onMount(() => {
          const t = setInterval(() => setN(v => v + 1), 1000)
          return () => clearInterval(t)
        })
        return <span>{n()}</span>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// JSX / loop edge cases (TODO grid: control-flow + identifier)
// ---------------------------------------------------------------------------

describe('member-expression component tag', () => {
  // `<Pkg.Comp />` — JSX tag is a member expression. Common with
  // compound components (`Dialog.Trigger`, `Tabs.Panel`).
  test('<Pkg.Comp /> compiles', () => {
    const src = `
      const Pkg = { Comp: function () { return <span>x</span> } }
      export function Demo() {
        return <div><Pkg.Comp /></div>
      }
    `
    expectNoFatalErrors(compile(src))
  })

  // #1319: an object-literal namespace (`const Pkg = { Comp }`) at
  // module scope lets the IR collector resolve the member expression
  // to the underlying component identifier. Without resolution, the
  // CSR `renderChild('Pkg.Comp', ...)` call fails the registry lookup
  // (only `Comp` / `Comp__<scope>` is ever registered) and the inner
  // component renders as the literal placeholder `[Pkg.Comp]`.
  test('<Pkg.Comp /> resolves through shorthand object-literal namespace (#1319)', () => {
    const src = `
      function Comp() { return <span>x</span> }
      const Pkg = { Comp }
      export function Demo() {
        return <div><Pkg.Comp /></div>
      }
    `
    const result = compile(src)
    expectNoFatalErrors(result)
    const clientJs = result.clientJs
    expect(clientJs).not.toMatch(/renderChild\('Pkg\.Comp'/)
    expect(clientJs).toMatch(/renderChild\('Comp(__[a-f0-9]+)?'/)
  })

  test('<Pkg.Comp /> resolves through explicit-identifier object-literal namespace (#1319)', () => {
    const src = `
      function Trigger() { return <button>x</button> }
      const Dialog = { Trigger: Trigger }
      export function Demo() {
        return <div><Dialog.Trigger /></div>
      }
    `
    const result = compile(src)
    expectNoFatalErrors(result)
    const clientJs = result.clientJs
    expect(clientJs).not.toMatch(/renderChild\('Dialog\.Trigger'/)
    expect(clientJs).toMatch(/renderChild\('Trigger(__[a-f0-9]+)?'/)
  })
})

describe('for...of generating JSX in component body', () => {
  // An imperative loop is a non-standard but legal way to build a JSX
  // tree. The analyzer treats `.map()` specially; `for...of` plus
  // `push` should also produce a valid tree.
  test('for...of building an array of JSX children', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [items, setItems] = createSignal<string[]>(['a', 'b', 'c'])
        const out: any[] = []
        for (const it of items()) {
          out.push(<li key={it}>{it}</li>)
        }
        return <ul onClick={() => setItems(i => i)}>{out}</ul>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('signal accessor renamed via alias import', () => {
  // SURFACED LIMITATION (#1244 sub-issue, same root cause as the
  // pre-existing failures in `primitive-resolver-alias.test.ts`):
  // `import { createSignal as cs }` is not recognised as a reactive
  // factory and the destructure raises BF110. The body asserts the
  // intended behaviour (clean compile). Drop `.todo` once fixed.
  test.todo('aliased createSignal still recognised as a reactive factory', () => {
    const src = `
      'use client'
      import { createSignal as cs } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = cs(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('JSX construction in an event-handler callback', () => {
  // Building JSX inside a setter (`setItems(prev => [...prev,
  // <Item />])`) — JSX outside the render path. The compiler must
  // either compile the JSX literal as a runtime call or refuse loudly.
  test('setter body contains a JSX literal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Item({ label }: { label: string }) { return <li>{label}</li> }
      export function Demo() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <button onClick={() => setItems(prev => [...prev, <Item key={prev.length} label={'n' + prev.length} />])}>
            add
          </button>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('logical && — string "0" rendering hazard', () => {
  // `{count() && <span/>}` with `count() === 0` should render nothing,
  // not the literal "0". Compile-only check that the binding is lowered
  // to a ternary (`count() ? <span> : null`) rather than a text node
  // that would coerce 0 to "0" at render time.
  test('count() && JSX lowers to a conditional, not a text binding', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [count, setCount] = createSignal(0)
        return <div onClick={() => setCount(c => c + 1)}>{count() && <span>has items</span>}</div>
      }
    `
    const c = compile(src)
    expectNoFatalErrors(c)
    // The lowered template should branch on `count()` — either through
    // a JS ternary (`? : null`) or an explicit conditional marker. A
    // raw `{count()}` placement (no surrounding branch) would render
    // the literal "0" when count is 0.
    expect(c.template).toMatch(/count\(\)\s*\?|bf-cond-|bf-c=/)
    expect(c.template).not.toMatch(/>\s*\{count\(\)\}\s*</)
  })
})

describe('children passed as a JSX expression value (not nested)', () => {
  test('children={<span>x</span>}', () => {
    const src = `
      function Box({ children }: { children: any }) { return <div>{children}</div> }
      export function Demo() {
        return <Box children={<span>x</span>} />
      }
    `
    expectNoFatalErrors(compile(src))
  })

  // #1320: a hoisted JSX child carries the outer scope, not the inner
  // template's. The CSR emit injects `bf-s="__BF_PARENT_SCOPE__"` on
  // the top-level hoisted element; renderChild substitutes it with
  // `_parentScopeId` at the layer where that is the outer scope.
  test('children={<span/>}: CSR emits the parent-scope placeholder on hoisted root (#1320)', () => {
    const src = `
      function Box({ children }: { children: any }) { return <div>{children}</div> }
      export function Demo() {
        return <Box children={<span>x</span>} />
      }
    `
    const result = compile(src)
    expectNoFatalErrors(result)
    expect(result.clientJs).toContain('<span bf-s="__BF_PARENT_SCOPE__">x</span>')
  })

  // #1335: the fragment-wrapped variant must produce the same CSR
  // emit as the bare-element form above. IR collection unwraps the
  // single-element fragment so the inner element inherits
  // `needsScope: true` and reaches the same #1320 placeholder gate.
  test('children={<><span/></>}: CSR emits the parent-scope placeholder on the unwrapped element (#1335)', () => {
    const src = `
      function Box({ children }: { children: any }) { return <div>{children}</div> }
      export function Demo() {
        return <Box children={<><span>x</span></>} />
      }
    `
    const result = compile(src)
    expectNoFatalErrors(result)
    expect(result.clientJs).toContain('<span bf-s="__BF_PARENT_SCOPE__">x</span>')
  })
})

describe('Fragment with siblings as a top-level return', () => {
  test('return <><a/><b/></> with two element siblings', () => {
    const src = `
      export function Demo() {
        return (
          <>
            <a href="x">x</a>
            <b>y</b>
          </>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Iteration alternatives (TODO grid: control-flow combinations)
// ---------------------------------------------------------------------------

describe('Array.from(iter, mapper) producing JSX children', () => {
  test('Array.from with a Set source and a mapper', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [tags, setTags] = createSignal(new Set<string>(['a', 'b']))
        return (
          <ul onClick={() => setTags(t => t)}>
            {Array.from(tags(), tag => <li key={tag}>{tag}</li>)}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('filter().map() chain that re-introduces JSX', () => {
  // Already covered by `filter-simple` for `.filter()` alone; this
  // test pins the chain end-to-end with a per-item reactive class.
  test('items.filter(...).map(it => <li className={…} />)', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type T = { id: string; visible: boolean; tone: string }
      export function Demo() {
        const [items, setItems] = createSignal<T[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().filter(it => it.visible).map(it => (
              <li key={it.id} className={\`row \${it.tone}\`}>{it.id}</li>
            ))}
          </ul>
        )
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Attribute surface (TODO grid: value-shape edges + binding site)
// ---------------------------------------------------------------------------

describe('SVG presentation attribute in kebab-case', () => {
  // `stroke-width` is the DOM-property name; React-style camelCase
  // (`strokeWidth`) is conventional in JSX. Compiler should accept
  // either; this test pins kebab-case.
  test('<rect stroke-width={...} /> compiles', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [w, setW] = createSignal(2)
        return <svg onClick={() => setW(v => v + 1)}><rect stroke-width={w()} /></svg>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('aria-* with a dynamic value', () => {
  test('aria-expanded={signal()} compiles and binds', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [open, setOpen] = createSignal(false)
        return <button onClick={() => setOpen(v => !v)} aria-expanded={open()}>x</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('data-* attribute with a hyphenated key and a reactive value', () => {
  test('data-test-id={signal()} compiles', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [id, setId] = createSignal('a')
        return <div onClick={() => setId('b')} data-test-id={id()}>x</div>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Component shape (TODO grid: lifecycle + TS surface)
// ---------------------------------------------------------------------------

describe('async function component', () => {
  // `async function Demo()` is the obvious shape for an `await fetch()`
  // body inside an `<Async>` boundary. Compiler should either accept it
  // or refuse loudly.
  test('async function Demo() compiles', () => {
    const src = `
      export async function Demo() {
        const v = await Promise.resolve('hi')
        return <span>{v}</span>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('top-level await in a stateful component body', () => {
  // Hazardous shape. Listed in the catalog as a likely surface.
  test('await in a "use client" component body compiles', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export async function Demo() {
        const [n, setN] = createSignal(0)
        const fetched = await Promise.resolve(42)
        return <button onClick={() => setN(v => v + fetched)}>{n()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('generic function component', () => {
  // `function List<T>({ items }: { items: T[] })` — type parameter on
  // the component. JSX vs TSX angle-bracket ambiguity sometimes trips
  // the parser; pin the supported shape.
  test('function List<T>(...) compiles', () => {
    const src = `
      export function List<T extends { id: string }>({ items }: { items: T[] }) {
        return <ul>{items.map(it => <li key={it.id}>{it.id}</li>)}</ul>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('arrow function component', () => {
  // The catalog assumes function-declaration shape; arrow-function
  // components (`export const Demo = () => …`) are a common alternative
  // — should compile identically.
  test('export const Demo = () => <span /> compiles', () => {
    const src = `
      export const Demo = () => <span>x</span>
    `
    expectNoFatalErrors(compile(src))
  })
})

// ---------------------------------------------------------------------------
// Closure / scope edges (TODO grid: identifier / scope)
// ---------------------------------------------------------------------------

describe('signal read inside a closure captured by an event handler', () => {
  // The handler does NOT call the signal directly — it calls a local
  // helper that closes over it. The compiler must still mark the
  // handler as depending on the signal (or, equivalently, the helper
  // must be reactive).
  test('handler delegates to a local helper that reads the signal', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(0)
        const describe = () => 'count is ' + n()
        return <button onClick={() => console.log(describe())}>{n()}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

describe('signal read inside a try/catch in render', () => {
  test('try/catch wrapping a signal read in JSX body', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const [n, setN] = createSignal(0)
        let display: string
        try {
          display = String(n())
        } catch {
          display = '?'
        }
        return <button onClick={() => setN(v => v + 1)}>{display}</button>
      }
    `
    expectNoFatalErrors(compile(src))
  })
})

