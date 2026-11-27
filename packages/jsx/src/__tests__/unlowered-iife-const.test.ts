// A module const initialized by calling a function literal in place (#4022):
// which ones the analyzer records as the body they return
// (`repeatableAppliedArrowValue`), and which ones the server render reads
// and `refuseUnloweredIifeConsts` refuses, against IR built by the real
// pipeline. The rendered contract is pinned by the conformance fixtures
// `module-const-iife-*` and `component-const-iife`.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { jsxToIR } from '../jsx-to-ir'
import { refuseUnloweredIifeConsts } from '../adapters/unlowered-iife-const'
import type { CompilerError, ComponentIR, ConstantInfo } from '../types'

function irFor(moduleDecls: string, body: string): ComponentIR {
  const ctx = analyzeComponent(`
    'use client'
    function Kid(props: { v?: string }) { return <b>{props.v}</b> }
    ${moduleDecls}
    export function C(props: { label?: string }) {
      ${body}
    }
  `, 'C.tsx', 'C')
  return { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
}

function constantOf(moduleDecls: string, name: string, body = 'return <p />'): ConstantInfo {
  return irFor(moduleDecls, body).metadata.localConstants.find(c => c.name === name)!
}

/** The const `B` of a component whose parameter list is `params`. */
function constantOfComponent(params: string, body: string): ConstantInfo {
  const ctx = analyzeComponent(`
    'use client'
    export function C(${params}) {
      ${body}
      return <p>{B.k}</p>
    }
  `, 'C.tsx', 'C')
  return buildMetadata(ctx).localConstants.find(c => c.name === 'B')!
}

function errorsOf(moduleDecls: string, body: string): CompilerError[] {
  const errors: CompilerError[] = []
  refuseUnloweredIifeConsts(irFor(moduleDecls, body), { errors, componentName: 'C' })
  expect(errors.every(e => e.code === 'BF101')).toBe(true)
  return errors
}

/** The const each refusal names. */
function refused(moduleDecls: string, body: string): string[] {
  return errorsOf(moduleDecls, body).map(e => e.message.slice(1, e.message.indexOf("' is initialized")))
}

describe('a const initialized by an applied zero-param arrow', () => {
  test('is recorded as the body it returns when the body repeats', () => {
    const c = constantOf(`const V = 'v'\nconst B = (() => ({ k: V }))()`, 'B')
    expect(c.value).toBe('({ k: V })')
    expect(c.parsed?.kind).toBe('object-literal')
    expect(c.containsArrow).toBeUndefined()
    expect(c.callsFunctionLiteral).toBeUndefined()
    // The `.tsx` output keeps the source as written.
    expect(c.typedValue).toBe('(() => ({ k: V }))()')
  })

  test('peels nested arrows and the value-transparent TS wrappers, at the callee and the result', () => {
    expect(constantOf(`const B = ((() => (() => 'n')())())`, 'B').value).toBe("'n'")
    expect(constantOf(`const B = ((() => ({ k: 't' }))() as { k: string })`, 'B').value).toBe("({ k: 't' })")
    expect(constantOf(`const B = (() => ['a'])() satisfies string[]`, 'B').value).toBe("['a']")
    expect(constantOf(`const B = (() => ({ k: 'v' }))()!`, 'B').value).toBe("({ k: 'v' })")
    expect(constantOf(`const B = ((() => ({ k: 'v' })) as () => { k: string })()`, 'B').value).toBe("({ k: 'v' })")
    expect(constantOf(`const B = ((() => ({ k: 'v' }))!)()`, 'B').value).toBe("({ k: 'v' })")
  })

  test('a read resolves to the declaration it sees: a const or a param named like an unrelated `let` lowers', () => {
    const unrelated = `function other() { let n = 2; let label = 'x'; var v = 3; return n + label + v }`
    expect(constantOf(`const n = 1\n${unrelated}\nconst B = (() => n)()`, 'B').value).toBe('n')
    const viaParam = irFor(unrelated, `const B = (() => ({ k: props.label }))()\n return <p>{B.k}</p>`).metadata.localConstants.find(c => c.name === 'B')!
    expect(viaParam.parsed?.kind).toBe('object-literal')
    // A shorthand read resolves the same way.
    expect(constantOf(`const n = 1\n${unrelated}\nconst B = (() => ({ n }))()`, 'B').parsed?.kind).toBe('object-literal')
    // A visible `let` / `var` (module scope, or one the component declares) keeps the call.
    expect(constantOf(`let n = 1\nconst B = (() => n)()`, 'B').callsFunctionLiteral).toBe(true)
    expect(constantOf(`var n = 1\nconst B = (() => ({ n }))()`, 'B').callsFunctionLiteral).toBe(true)
    const local = irFor(`const n = 1`, `let n = 2\n const B = (() => n)()\n return <p>{B}</p>`).metadata.localConstants.find(c => c.name === 'B')!
    expect(local.callsFunctionLiteral).toBe(true)
  })

  test('a read of a binding something writes keeps the call, a prop included', () => {
    const unrelated = `function unrelated() { let label = 1; return label }`
    const named = (decls: string, body: string) =>
      irFor(decls, `${body}\n return <p>{B.k}</p>`).metadata.localConstants.find(c => c.name === 'B')!
    // An unwritten prop named like an unrelated \`let\` lowers.
    expect(named(unrelated, `const B = (() => ({ k: props.label }))()`).parsed?.kind).toBe('object-literal')
    for (const write of [
      `props = { label: 'x' }`,
      `const set = () => { props = { label: 'x' } }`,
    ]) expect(named(unrelated, `const B = (() => ({ k: props }))()\n ${write}`).callsFunctionLiteral).toBe(true)
    // A destructured prop written in every form.
    const destructured = (write: string) =>
      constantOfComponent(`{ label }: { label: string }`, `const B = (() => ({ k: label }))()\n ${write}`)
    for (const write of [
      `label = 'updated'`, `label += '!'`, `;({ label } = { label: 'z' })`, `;[label] = ['z']`,
      `for (label of ['a']) {}`, `const set = () => { label = 'x' }`, `label++`,
    ]) expect(destructured(write).callsFunctionLiteral).toBe(true)
    expect(destructured(`const other = label + '!'`).parsed?.kind).toBe('object-literal')
    // A write to a same-named binding of another scope does not count.
    expect(destructured(`const f = (label: string) => { label = 'x'; return label }`).parsed?.kind).toBe('object-literal')
  })

  test('`arguments`, `this` and the like as a key or a member name read nothing', () => {
    expect(constantOf(`const B = (() => ({ arguments: 1, this: 2, super: 3, delete: 4, await: 5, yield: 6 }))()`, 'B').parsed?.kind).toBe('object-literal')
    expect(constantOf(`const O = { arguments: 'a' }\nconst B = (() => O.arguments)()`, 'B').value).toBe('O.arguments')
    expect(constantOf(`const B = (() => ({ [String('k')]: 1 }))()`, 'B').callsFunctionLiteral).toBe(true)
  })

  test('a component-scope const takes the same decision', () => {
    const c = irFor('', `const B = (() => ({ k: props.label }))()\n return <p>{B.k}</p>`).metadata.localConstants.find(c => c.name === 'B')!
    expect(c.parsed?.kind).toBe('object-literal')
  })

  test('keeps the call for a body that does not repeat, writes, returns a function or still calls one', () => {
    for (const decl of [
      // A write (#4022 review): the body runs once in JS.
      `const o: { k?: string } = { k: 'v' }\nconst B = (() => delete o.k)()`,
      `const o = { n: 1 }\nconst B = (() => (o.n = 2))()`,
      `const o = { n: 1 }\nconst B = (() => (o.n += 2))()`,
      `const o = { n: 1 }\nconst B = (() => o.n++)()`,
      `const o = { n: 1 }\nconst B = (() => --o.n)()`,
      // A returned anonymous function takes the const's name once substituted.
      `const B = (() => () => 1)()`,
      `const B = (() => function () { return 1 })()`,
      `const B = (() => class {})()`,
      `const B = (() => ({ f: () => 1 }))()`,
      // An applied arrow left under an operator after the peel.
      `const B = (() => (() => 1)() + 2)()`,
      // A read of a \`let\` may see a later assignment.
      `let n = 1\nn = 2\nconst B = (() => n)()`,
      // A block body under a non-null assertion.
      `const B = (() => { return { k: 'v' } })()!`,
      `const B = (() => ({ k: new Date(0).toISOString() }))()`,
      `const B = (() => ({ k: String(Math.random()) }))()`,
      'const B = (() => ({ k: `${String.raw`x`}` }))()',
      `const B = (() => { return { k: 'v' } })()`,
      `const B = (function () { return { k: 'v' } })()`,
      `const B = ((x: string) => ({ k: x }))('v')`,
      `const B = (async () => ({ k: 'v' }))()`,
    ]) {
      const c = constantOf(decl, 'B')
      expect(c.containsArrow || c.callsFunctionLiteral).toBe(true)
      expect(c.callsFunctionLiteral).toBe(true)
    }
  })

  test('flags a call of a function literal anywhere the initializer runs it', () => {
    for (const decl of [
      `const B = (() => 1)() + 2`,
      `const c = true\nconst B = c ? (() => 1)() : 2`,
      'const B = `${(() => "v")()}`',
      `const B = [(() => 1)()]`,
      `const B = { k: (() => 'v')() }`,
      `const B = [1].map(x => (() => x + 1)())`,
      `const B = (function* () { yield 1 })()`,
    ]) expect(constantOf(decl, 'B').callsFunctionLiteral).toBe(true)
    // The defaults of an in-place callback's parameters run with it.
    for (const decl of [
      `const B = [undefined].map((x = (() => 1)()) => x)`,
      `const B = [{}].map(({ a = (() => 1)() }: { a?: number }) => a)`,
      `const B = [[]].map(([a = [(() => 1)()][0]]: number[]) => a)`,
      `const B = [undefined].map(function (x = (() => 1)()) { return x })`,
    ]) expect(constantOf(decl, 'B').callsFunctionLiteral).toBe(true)
    // A function stored in the value runs only when called, its defaults too.
    expect(constantOf(`const H = { safe: 'x', f: () => (() => 1)() }`, 'H').callsFunctionLiteral).toBeUndefined()
    expect(constantOf(`const H = { safe: 'x', f: (x = (() => 1)()) => x }`, 'H').callsFunctionLiteral).toBeUndefined()
    expect(constantOf(`const H = { safe: 'x', f(x = (() => 1)()) { return x } }`, 'H').callsFunctionLiteral).toBeUndefined()
    expect(constantOf(`const H = [1].map(x => x + 1)`, 'H').callsFunctionLiteral).toBeUndefined()
    // A `.map(` initializer builds a per-file program for type-based detection (~1s each).
  }, 60_000)

  test('reads of the enclosing function keep the call', () => {
    for (const body of ['typeof this', 'arguments.length', 'typeof new.target']) {
      const c = irFor('', `const B = (() => ${body})()\n return <p>{B}</p>`).metadata.localConstants.find(c => c.name === 'B')!
      expect(c.callsFunctionLiteral).toBe(true)
    }
  })

  test('a JSX body is not recorded as a JSX const', () => {
    const c = constantOf(`const B = (() => <i>x</i>)()`, 'B')
    expect(c.isJsx).toBe(false)
    expect(c.callsFunctionLiteral).toBe(true)
  })

  test('a `let` keeps the call', () => {
    expect(constantOf(`let B = (() => 'v')()`, 'B').value).toBe("(() => 'v')()")
  })
})

describe('refuseUnloweredIifeConsts', () => {
  const block = `const B = (() => { return { k: 'v' } })()`

  test('a module const the server render reads, in text, an attribute and a child prop', () => {
    expect(refused(block, `return <p>{B.k}</p>`)).toEqual(['B'])
    expect(refused(block, `return <p title={B.k} />`)).toEqual(['B'])
    expect(refused(block, `return <div><Kid v={B.k} /></div>`)).toEqual(['B'])
    // Through a module const that reads it.
    expect(refused(`${block}\nconst K = B.k`, `return <p>{K}</p>`)).toEqual(['B'])
  })

  test('only a const no child prop reads claims the /* @client */ escape', () => {
    const escapes = (body: string) => errorsOf(block, body).map(e => (e.suggestion?.escape ?? []).map(x => x.kind))
    expect(escapes(`return <p>{B.k}</p>`)).toEqual([['client-directive']])
    expect(escapes(`return <div>{B.k}<Kid v={B.k} /></div>`)).toEqual([[]])
  })

  test('a read the server render does not perform is not refused', () => {
    expect(refused(block, `return <p>{/* @client */ B.k}</p>`)).toEqual([])
    expect(refused(block, `return <button onClick={() => console.log(B)}>x</button>`)).toEqual([])
    expect(refused(block, `return <p>x</p>`)).toEqual([])
  })

  test('a module `let` is refused whatever its arrow', () => {
    expect(refused(`let B = (() => ({ k: 'v' }))()`, `return <p>{B.k}</p>`)).toEqual(['B'])
  })

  test('a component-scope const, and not a module const of the same name it hides', () => {
    expect(refused('', `const B = (() => { return { k: props.label } })()\n return <p>{B.k}</p>`)).toEqual(['B'])
    expect(refused(block, `const B = { k: 'c' }\n return <p>{B.k}</p>`)).toEqual([])
  })

  test('a repeatable applied arrow is not refused', () => {
    expect(refused(`const B = (() => ({ k: 'v' }))()`, `return <p>{B.k}</p>`)).toEqual([])
    expect(refused('', `const B = (() => ({ k: props.label }))()\n return <p>{B.k}</p>`)).toEqual([])
  })
})
