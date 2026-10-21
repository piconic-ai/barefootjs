/**
 * No substitution rewrites a written binding.
 *
 * The client JS replaces reads of component bindings with expressions that
 * produce their value: a destructured prop with its live read
 * `(_p.start ?? 0)`, an inlinable local with its declared value `(0)` in the
 * client template. A write position cannot take such a replacement:
 * `++start` became `++(_p.start ?? 0)` and `{++nextId}` became `++(0)`, a
 * SyntaxError that broke the whole client module.
 *
 *   - A destructured prop the component writes anywhere (`ParamInfo.reassigned`)
 *     is a local: init declares `let start = _p.start ?? 0` once and keeps
 *     every reference to it.
 *   - A local a markup expression writes during render is not inlined
 *     (`mutatedAfterDeclaration`); a write in an event handler leaves the
 *     declared value inlinable, since render sees that value.
 *   - A client-template expression that writes a binding (a memo body, a
 *     child's arrow prop) is left to init.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { isAssignmentTargetIdentifier } from '../assignment-target'
import { analyzeComponent } from '../analyzer'
import { keepsDeclaredValue } from '../props-binding'

const adapter = new TestAdapter()
const transpiler = new Bun.Transpiler({ loader: 'js' })

function clientJs(body: string, params = '', extra = ''): string {
  const source = `
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    ${extra}
    export function C(${params}) {
      ${body}
    }
  `
  const result = compileJSX(source, 'C.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const js = result.files.find(f => f.type === 'clientJs')!.content
  expect(() => transpiler.transformSync(js)).not.toThrow()
  return js
}

function templateOf(js: string): string {
  const line = js.split('\n').find(l => l.includes("hydrate('C'"))
  expect(line).toBeDefined()
  return line!
}

describe('a destructured prop the component writes is an init local', () => {
  const P = '{ start = 0 }: { start?: number }'

  test('a prefix update in an inline handler', () => {
    const js = clientJs(
      `const [items, setItems] = createSignal<number[]>([])
      return <div><button onClick={() => setItems([...items(), ++start])}>add</button><p>{items().join(',')}</p></div>`,
      P,
    )
    expect(js).toContain('let start = _p.start ?? 0')
    expect(js).toContain('++start')
    expect(js).not.toContain('++(_p.start')
  })

  test('a compound assignment in a handler const, with the prop also read in markup', () => {
    const js = clientJs(
      `const [items, setItems] = createSignal<number[]>([])
      const add = () => { start += 1; setItems([...items(), start]) }
      return <div><button onClick={add}>add</button><p>{start}</p><p>{items().join(',')}</p></div>`,
      P,
    )
    expect(js).toContain('const add = () => { start += 1; setItems([...items(), start]) }')
    // Until a handler runs, the binding holds the prop: the template reads it.
    expect(templateOf(js)).toContain('(_p.start ?? 0)')
  })

  test('a top-level reassignment', () => {
    const js = clientJs(`start = start + 1\n      return <p>{start}</p>`, P)
    expect(js).toContain('let start = _p.start ?? 0')
    expect(js).toContain('start = start + 1')
  })

  test('a destructuring assignment and a for-in head', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      return <div><button onClick={() => { [a, b] = [b, a]; for (k in { x: 1 }) {} setN(a) }}>go</button><p>{n()}</p></div>`,
      '{ a = 1, b = 2, k = "" }: { a?: number; b?: number; k?: string }',
    )
    expect(js).toContain('[a, b] = [b, a]')
    expect(js).toContain('for (k in')
    expect(js).toContain('let a = _p.a ?? 1')
  })

  test('a prop without a default no longer writes the props object', () => {
    const js = clientJs(
      `const [items, setItems] = createSignal<number[]>([])
      return <div><button onClick={() => setItems([...items(), ++start])}>add</button><p>{items().join(',')}</p></div>`,
      '{ start }: { start: number }',
    )
    expect(js).toContain('let start = _p.start')
    expect(js).not.toContain('++_p.start')
  })

  test('a renamed prop declares its local from the caller-facing key', () => {
    const js = clientJs(
      `const [items, setItems] = createSignal<number[]>([])
      return <div><button onClick={() => setItems([...items(), ++s])}>add</button><p>{items().join(',')}</p></div>`,
      '{ start: s = 0 }: { start?: number }',
    )
    expect(js).toContain('let s = _p.start ?? 0')
    expect(js).toContain('++s')
  })

  test('a handler-local binding of the same name is not the prop', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      const add = () => { let start = 1; start++; setN(start) }
      return <div><button onClick={add}>{start}</button><p>{n()}</p></div>`,
      P,
    )
    expect(js).not.toContain('let start = _p.start')
    expect(js).toContain('let start = 1; start++')
  })

  test('a markup write leaves the template slot to init', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{n()}:{++start}</p></div>`,
      P,
    )
    expect(js).toContain('const __val = ++start')
    expect(templateOf(js)).not.toContain('++')
  })

  test('a child arrow prop that writes it defers the child to init', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{n()}</p><Show get={() => ++start} /></div>`,
      P,
      'function Show(props: { get: () => number }) { return <i>{props.get()}</i> }',
    )
    expect(templateOf(js)).toContain('data-bf-ph')
    expect(js).toContain('return () => ++start')
  })
})

describe('a `for (let …)` head shadows a prop of the same name', () => {
  test('the loop variable is not rewritten to the prop', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      const add = () => { let t = 0; for (let i = 0; i < 3; i++) t += i; setN(t + i) }
      return <div><button onClick={add}>go</button><p>{n()}</p></div>`,
      '{ i = 5 }: { i?: number }',
    )
    expect(js).toContain('for (let i = 0; i < 3; i++) t += i; setN(t + (_p.i ?? 5))')
  })
})

describe('a written local in the client template', () => {
  test('a write in an event handler keeps the declared value inlined', () => {
    const js = clientJs(
      `const [items, setItems] = createSignal<number[]>([])
      let nextId = 0
      const add = () => setItems([...items(), ++nextId])
      return <div><button onClick={add}>add</button><p>{nextId}</p><p>{items().join(',')}</p></div>`,
    )
    expect(js).toContain('const add = () => setItems([...items(), ++nextId])')
    expect(templateOf(js)).toContain('<p>${escapeText((0))}</p>')
  })

  test('a markup update is not inlined', () => {
    const js = clientJs(
      `let nextId = 0
      return <div><p>{++nextId}</p><p>{nextId++}</p></div>`,
    )
    const t = templateOf(js)
    expect(t).not.toContain('(0)')
    expect(t).not.toContain('++')
  })

  test('a counter a loop row increments is not inlined', () => {
    const js = clientJs(
      `const [items, setItems] = createSignal<string[]>(['a', 'b'])
      let count = 0
      return <ul><button onClick={() => setItems([...items(), 'c'])}>add</button>{items().map(i => <li key={i}>{i}{++count}</li>)}</ul>`,
    )
    expect(templateOf(js)).not.toContain('++(0)')
  })

  test("a memo body's own loop variable and block locals are not binding writes", () => {
    const js = clientJs(
      `const [n, setN] = createSignal(3)
      const total = createMemo(() => { let t = 0; for (let i = 0; i < n(); i++) { let d = i; d++; t += d } return t })
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{total()}</p></div>`,
    )
    expect(templateOf(js)).toContain('for (let i = 0; i < (3); i++)')
  })

  test('a memo body that writes a local is left to init', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      let calls = 0
      const doubled = createMemo(() => { calls++; return n() * 2 })
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{doubled()}</p></div>`,
    )
    expect(js).toContain('calls++')
    expect(templateOf(js)).not.toContain('(0)++')
  })

  test('a child arrow prop that writes a local defers the child', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      let nextId = 0
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{n()}</p><Show get={() => ++nextId} /></div>`,
      '',
      'function Show(props: { get: () => number }) { return <i>{props.get()}</i> }',
    )
    expect(templateOf(js)).toContain('data-bf-ph')
    expect(templateOf(js)).not.toContain('++(0)')
  })
})

describe('isAssignmentTargetIdentifier', () => {
  function targets(code: string, name: string): boolean[] {
    const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true)
    const out: boolean[] = []
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && n.text === name) out.push(isAssignmentTargetIdentifier(n))
      ts.forEachChild(n, visit)
    }
    visit(sf)
    return out
  }

  test('writes', () => {
    for (const code of [
      'x = 1', 'x += 1', 'x ??= 1', '++x', 'x--', '(x) = 1', 'x! = 1', '(x as number) = 1',
      '[x] = a', '[y, ...x] = a', '({ x } = o)', '({ k: x } = o)', '({ ...x } = o)', '[x = 1] = a',
      'for (x of a) {}', 'for (x in o) {}',
    ]) {
      expect({ code, t: targets(code, 'x') }).toEqual({ code, t: [true] })
    }
  })

  test('reads', () => {
    for (const code of [
      'y = x', 'x.a = 1', 'x[0]++', 'f([x])', 'y = [x]', '({ k: x })', '[y = x] = a',
      '({ y = x } = o)', 'for (const x of a) {}', 'x + 1', '-x', '!x',
    ]) {
      expect({ code, t: targets(code, 'x').every(t => !t) }).toEqual({ code, t: true })
    }
  })
})

describe('one notion of a written binding', () => {
  test('a binding the analyzer marks written fails keepsDeclaredValue, a prop and a body binding alike', () => {
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      export function C({ start = 0, step = 1 }: { start?: number; step?: number }) {
        const [n, setN] = createSignal(0)
        let nextId = 0
        const label = 'x'
        const add = () => { start += step; setN(++nextId) }
        return <div><button onClick={add}>{label}</button><p>{n()}</p></div>
      }`,
      'C.tsx',
    )
    const param = (name: string) => ctx.propsParams.find(p => p.name === name)!
    const local = (name: string) => ctx.localConstants.find(c => c.name === name)!
    expect(param('start').reassigned).toBe(true)
    expect(keepsDeclaredValue(param('start'))).toBe(false)
    expect(keepsDeclaredValue(param('step'))).toBe(true)
    expect(local('nextId').reassigned).toBe(true)
    expect(keepsDeclaredValue(local('nextId'))).toBe(false)
    // A handler's write leaves the declared value for render.
    expect(local('nextId').mutatedAfterDeclaration).toBeUndefined()
    expect(keepsDeclaredValue(local('label'))).toBe(true)
  })
})
