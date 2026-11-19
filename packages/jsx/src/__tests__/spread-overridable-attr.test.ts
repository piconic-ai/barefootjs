/**
 * A literal attribute before an open spread (`<p title="a" {...rest}>`)
 * carries `IRAttribute.spreadOverridable`: the attribute as a template
 * renders it when the spread may hold the same key. JS lets the later write
 * win, so the key must render once. Phase 1 decides the condition here; every
 * template adapter reads it through `renderElementAttributes`. The rendered
 * output is pinned by the `literal-attr-before-spread` conformance fixture.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { planAttrExpression, type AttrPlanContext } from '../adapters/attr-plan'
import { renderElementAttributes } from '../adapters/element-shell'
import type { AttrValueEmitter } from '../adapters/attr-value-emitter'
import type { ComponentIR, IRAttribute, IRElement, IRNode } from '../types'

function irOf(source: string): ComponentIR {
  const file = compileJSX(source, 'Component.tsx', { adapter: new TestAdapter(), outputIR: true }).files.find(f => f.type === 'ir')
  if (!file) throw new Error('no IR')
  return JSON.parse(file.content) as ComponentIR
}

/** The first element whose tag is `tag`. */
function elementOf(ir: ComponentIR, tag: string): IRElement {
  let found: IRElement | null = null
  const visit = (n: unknown): void => {
    if (found !== null) return
    if (Array.isArray(n)) return n.forEach(visit)
    if (n === null || typeof n !== 'object') return
    const rec = n as { type?: string; tag?: string }
    if (rec.type === 'element' && rec.tag === tag) found = n as IRElement
    else for (const v of Object.values(n)) visit(v)
  }
  visit(ir.root as IRNode)
  if (found === null) throw new Error(`no <${tag}>`)
  return found
}

function attrOf(element: IRElement, name: string): IRAttribute {
  const attr = element.attrs.find(a => a.name === name)
  if (!attr) throw new Error(`no ${name} attribute`)
  return attr
}

const planCtx: AttrPlanContext = {
  propsObjectName: null,
  restPropsName: 'rest',
  nullableOptionalProps: new Set(),
  nullableSignalGetters: new Set(),
  nullishAttrCtx: {} as AttrPlanContext['nullishAttrCtx'],
  isLoopBound: () => false,
  boolStr: () => false,
}

const open = `type P = { title?: string; [key: string]: unknown }`

describe('spreadOverridable on a literal before an open spread', () => {
  test('a literal is guarded by the bag lacking its key', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <p title="a" {...rest}>x</p> }`)
    const title = attrOf(elementOf(ir, 'p'), 'title')
    expect(title.value).toEqual({ kind: 'literal', value: 'a' })
    expect(title.spreadOverridable?.expr).toBe('rest.title == null ? "a" : undefined')
    expect(title.spreadOverridable?.parsed?.kind).toBe('conditional')
  })

  test('a guarded literal prints as written, whatever the attribute name', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <input disabled="" hidden {...rest} /> }`)
    const el = elementOf(ir, 'input')
    const disabled = attrOf(el, 'disabled').spreadOverridable!
    expect(disabled.literalText).toBe(true)
    expect(planAttrExpression(disabled, 'disabled', planCtx).kind).toBe('undefined-alternate')
    const hidden = attrOf(el, 'hidden').spreadOverridable!
    expect(hidden.literalText).toBeUndefined()
    expect(planAttrExpression(hidden, 'hidden', planCtx).kind).toBe('boolean-attr')
  })

  test('a bare boolean attribute and a non-identifier key', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <p hidden data-x="a" {...rest}>x</p> }`)
    const p = elementOf(ir, 'p')
    expect(attrOf(p, 'hidden').spreadOverridable?.expr).toBe('rest.hidden == null ? true : undefined')
    expect(attrOf(p, 'data-x').spreadOverridable?.expr).toBe('rest["data-x"] == null ? "a" : undefined')
  })

  test('`class` is read as the JSX key `className`, as the reference adapter writes it', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <p className="a" {...rest}>x</p> }`)
    expect(attrOf(elementOf(ir, 'p'), 'class').spreadOverridable?.expr).toBe('rest.className == null ? "a" : undefined')
  })

  test('a literal after the spread, or beside no spread, is not marked', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <div><p {...rest} title="a">x</p><i title="b">y</i></div> }`)
    expect(attrOf(elementOf(ir, 'p'), 'title').spreadOverridable).toBeUndefined()
    expect(attrOf(elementOf(ir, 'i'), 'title').spreadOverridable).toBeUndefined()
  })

  test('a key the rest destructure took is not in the bag, so it is not marked', () => {
    const ir = irOf(`${open}
export function C({ title, ...rest }: P) { return <p title="a" lang="en" {...rest}>{title}</p> }`)
    const p = elementOf(ir, 'p')
    expect(attrOf(p, 'title').spreadOverridable).toBeUndefined()
    expect(attrOf(p, 'lang').spreadOverridable?.expr).toBe('rest.lang == null ? "en" : undefined')
  })

  test('the props object lacks a key its type does not declare, so it is not marked', () => {
    const ir = irOf(`export function C(props: { title?: string }) { return <p title="a" lang="en" {...props}>x</p> }`)
    const p = elementOf(ir, 'p')
    expect(attrOf(p, 'title').spreadOverridable?.expr).toBe('props.title == null ? "a" : undefined')
    expect(attrOf(p, 'lang').spreadOverridable).toBeUndefined()
  })

  test('a rest bag spelled like the props object is not read through a member', () => {
    const ir = irOf(`${open}
export function C({ size, ...props }: P) { return <p title="a" {...props}>{size}</p> }`)
    expect(attrOf(elementOf(ir, 'p'), 'title').spreadOverridable).toBeUndefined()
  })

  test('a signal getter bag is read twice, and every later spread must lack the key', () => {
    const ir = irOf(`import { createSignal } from '@barefootjs/client'
export function C() {
  const [a] = createSignal<Record<string, string>>({})
  const [b] = createSignal<Record<string, string>>({})
  return <p title="x" {...a()} {...b()}>x</p>
}`)
    expect(attrOf(elementOf(ir, 'p'), 'title').spreadOverridable?.expr).toBe('a().title == null && b().title == null ? "x" : undefined')
  })

  test('a spread this cannot read twice leaves the literal as it is', () => {
    const ir = irOf(`export function C(props: { on?: boolean }) {
  return <p title="a" {...(props.on ? { lang: 'x' } : {})}>x</p>
}`)
    expect(attrOf(elementOf(ir, 'p'), 'title').spreadOverridable).toBeUndefined()
  })

  test('the string value is a code-safe literal', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <p title="</b> &amp; x" {...rest}>x</p> }`)
    expect(attrOf(elementOf(ir, 'p'), 'title').spreadOverridable?.expr).toBe('rest.title == null ? "\\u003c\\u002fb\\u003e & x" : undefined')
  })
})

describe('renderElementAttributes reads spreadOverridable', () => {
  const emitter: AttrValueEmitter = {
    emitLiteral: (v, name) => `${name}="${v.value}"`,
    emitExpression: (v, name) => `${name}={${v.expr}}`,
    emitBooleanAttr: (_v, name) => name,
    emitBooleanShorthand: (_v, name) => name,
    emitTemplate: (_v, name) => `${name}=<template>`,
    emitSpread: (v) => `...${v.expr}`,
    emitJsxChildren: (_v, name) => name,
  }

  test('an element with the mark renders the guarded form, one without renders the literal', () => {
    const ir = irOf(`${open}
export function C({ ...rest }: P) { return <div><p title="a" {...rest}>x</p><i title="b">y</i></div> }`)
    expect(renderElementAttributes(elementOf(ir, 'p'), emitter)).toBe(' title={rest.title == null ? "a" : undefined} ...rest')
    expect(renderElementAttributes(elementOf(ir, 'i'), emitter)).toBe(' title="b"')
  })
})
