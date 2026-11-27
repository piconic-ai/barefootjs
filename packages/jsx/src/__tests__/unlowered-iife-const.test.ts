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

  test('peels nested arrows, parentheses and type assertions', () => {
    expect(constantOf(`const B = ((() => (() => 'n')())())`, 'B').value).toBe("'n'")
    expect(constantOf(`const B = ((() => ({ k: 't' }))() as { k: string })`, 'B').value).toBe("({ k: 't' })")
    expect(constantOf(`const B = (() => ['a'])() satisfies string[]`, 'B').value).toBe("['a']")
  })

  test('a component-scope const takes the same decision', () => {
    const c = irFor('', `const B = (() => ({ k: props.label }))()\n return <p>{B.k}</p>`).metadata.localConstants.find(c => c.name === 'B')!
    expect(c.parsed?.kind).toBe('object-literal')
  })

  test('keeps the call for a body that does not repeat, a block body, a parameter or async', () => {
    for (const decl of [
      `const B = (() => ({ k: new Date(0).toISOString() }))()`,
      `const B = (() => ({ k: String(Math.random()) }))()`,
      'const B = (() => ({ k: `${String.raw`x`}` }))()',
      `const B = (() => { return { k: 'v' } })()`,
      `const B = (function () { return { k: 'v' } })()`,
      `const B = ((x: string) => ({ k: x }))('v')`,
      `const B = (async () => ({ k: 'v' }))()`,
    ]) {
      const c = constantOf(decl, 'B')
      expect(c.parsed?.kind).not.toBe('object-literal')
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
