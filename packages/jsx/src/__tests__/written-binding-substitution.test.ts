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
 *   - A client component's markup that writes a binding while it renders
 *     (`{++nextId}`) is refused with BF065: no client path could keep the
 *     written value. A write in an event handler leaves the declared value
 *     inlinable, since render sees that value.
 *   - A client-template expression that writes a binding (a memo body, a
 *     const whose initializer writes) is left to init, on every template
 *     path: a component that writes a binding never takes the static one.
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


/** The diagnostics' codes for `body` compiled as component `C`. */
function codesOf(body: string, params = '', extra = '', directive = "'use client'"): string[] {
  const source = `
    ${directive}
    import { createSignal } from '@barefootjs/client'
    ${extra}
    export function C(${params}) {
      ${body}
    }
  `
  return compileJSX(source, 'C.tsx', { adapter }).errors.map(e => e.code)
}

/**
 * Run the registration template of `C` (`template: (_p) => \`…\``) with
 * `props`, the runtime's escape helpers stubbed as plain string coercion.
 */
function runTemplate(js: string, props: Record<string, unknown>): string {
  const line = templateOf(js)
  const start = line.indexOf('template: ') + 'template: '.length
  const end = line.lastIndexOf(' })')
  const helperNames = (js.match(/^import \{ ([^}]+) \} from '@barefootjs\/client\/runtime'/m)?.[1] ?? '')
    .split(',').map(n => n.trim()).filter(Boolean)
  const stub = (v: unknown) => (v == null ? '' : String(v))
  const template = new Function(...helperNames, `return ${line.slice(start, end)}`)(...helperNames.map(() => stub))
  return template(props)
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

})

describe('every template path leaves a write to init', () => {
  test('a stateless component writing a prop in a handler renders the prop from its template', () => {
    const js = clientJs(`return <button onClick={() => start++}>{start}</button>`, '{ start = 0 }: { start?: number }')
    expect(js).toContain('let start = _p.start ?? 0')
    expect(runTemplate(js, { start: 5 })).toContain('5')
    expect(runTemplate(js, {})).toContain('0')
  })

  test('a const whose initializer writes a prop is not inlined into a stateless template', () => {
    const js = clientJs(`const label = ++start\n      return <p>{label}:{start}</p>`, '{ start = 0 }: { start?: number }')
    expect(js).toContain('const label = ++start')
    expect(templateOf(js)).not.toContain('++start')
    expect(() => runTemplate(js, { start: 5 })).not.toThrow()
    // init runs the write once and repaints the slot.
    expect(js).toContain('const __val = label')
  })
})

describe('BF065: a client component markup that writes a binding while it renders', () => {
  const CHILD = 'function Show(props: { get: () => number }) { return <i>{props.get()}</i> }'

  test('is refused for a local, a prop and a counter a `.map()` row increments', () => {
    expect(codesOf(`let id = 0\n      return <p>{++id}</p>`)).toContain('BF065')
    expect(codesOf(`let id = 0\n      return <p>{id++}</p>`)).toContain('BF065')
    expect(codesOf(`return <p>{++start}</p>`, '{ start = 0 }: { start?: number }')).toContain('BF065')
    expect(codesOf(`let count = 0\n      return <ul>{['a', 'b'].map(i => <li key={i}>{++count}</li>)}</ul>`)).toContain('BF065')
    expect(codesOf(`let count = 0\n      return <ul>{['a', 'b'].map(i => { count++; return <li key={i}>{count}</li> })}</ul>`)).toContain('BF065')
    expect(codesOf(`let id = 0\n      return <p>{(() => ++id)()}</p>`)).toContain('BF065')
  })

  test('is not raised for a callback the markup hands on, or a top-level statement', () => {
    expect(codesOf(`let id = 0\n      return <button onClick={() => { id++ }}>{id}</button>`)).not.toContain('BF065')
    expect(codesOf(`let id = 0\n      return <div><Show get={() => ++id} /></div>`, '', CHILD)).not.toContain('BF065')
    expect(codesOf(
      `let api = null\n      return <Ctx.Provider value={{ setApi: (a: unknown) => { api = a } }}><i /></Ctx.Provider>`,
      '',
      "import { createContext } from '@barefootjs/client'\n    const Ctx = createContext<unknown>(null)",
    )).not.toContain('BF065')
    expect(codesOf(`let id = 0\n      id++\n      return <p>{id}</p>`)).not.toContain('BF065')
  })

  test('is not raised for a handler wrapped by another call, which may run it later', () => {
    const wrap = 'const wrap = (fn: () => void) => fn'
    const body = (handler: string) =>
      `const [n, setN] = createSignal(0)
      let count = 0
      return <div><button onClick={${handler}}>add</button><p>{n()}</p></div>`
    const wrapped = body('wrap(() => { ++count; setN(count) })')
    expect(codesOf(wrapped, '', wrap)).not.toContain('BF065')
    expect(codesOf(body('() => { ++count; setN(count) }'), '', wrap)).not.toContain('BF065')
    expect(codesOf(body('debounce(() => { count++ }, 100)'), '', 'declare function debounce(fn: () => void, ms: number): () => void')).not.toContain('BF065')
    // The control: a `.map()` callback runs in place, so its write is still refused.
    expect(codesOf(`let count = 0\n      return <ul>{['a'].map(i => { count++; return <li key={i}>{count}</li> })}</ul>`)).toContain('BF065')

    // The wrapped listener keeps the init local and increments it.
    const js = clientJs(body('wrap(() => { ++count; setN(count) })'), '', wrap)
    expect(js).toContain('let count = 0')
    const listener = js.split('\n').find(l => l.includes("addEventListener('click', "))!
    const handlerText = listener.slice(listener.indexOf("'click', ") + "'click', ".length, listener.lastIndexOf(')'))
    expect(handlerText).toBe('wrap(() => { ++count; setN(count) })')
    // Run the emitted listener expression against an init-scope `count`.
    const calls: number[] = []
    const count = new Function('wrap', 'setN', `let count = 0; const h = ${handlerText}; h(); h(); return count`)(
      (fn: () => void) => fn,
      (v: number) => calls.push(v),
    )
    expect(count).toBe(2)
    expect(calls).toEqual([1, 2])
  })

  test('a child prop that writes a local renders the child from init, not the template', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      let nextId = 0
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{n()}</p><Show get={() => ++nextId} /></div>`,
      '',
      CHILD,
    )
    expect(templateOf(js)).toContain('data-bf-ph')
    expect(templateOf(js)).not.toContain('++')
    expect(js).toContain('return () => ++nextId')
  })

  test('a child prop that writes a prop renders the child from init, not the template', () => {
    const js = clientJs(
      `const [n, setN] = createSignal(0)
      return <div><button onClick={() => setN(n() + 1)}>add</button><p>{n()}</p><Show get={() => ++start} /></div>`,
      '{ start = 0 }: { start?: number }',
      CHILD,
    )
    expect(templateOf(js)).toContain('data-bf-ph')
    expect(js).toContain('let start = _p.start ?? 0')
    expect(js).toContain('return () => ++start')
  })

  test('is not raised for a server-only component, which has no client template', () => {
    expect(codesOf(`let id = 0\n      return <p>{++id}</p>`, '', '', '')).not.toContain('BF065')
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
