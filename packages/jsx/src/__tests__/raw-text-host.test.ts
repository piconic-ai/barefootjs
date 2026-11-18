/**
 * Dynamic children of `<style>` / `<script>` / `<textarea>` / `<title>` (#3910).
 *
 * Phase 1 lowers them to slotless text (`IRElement.rawTextHost`): no template
 * adapter and no CSR template wears a `<!--bf:sN-->` marker there. The client
 * rewrites the element's own content. Shapes that update cannot express are
 * refused.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function compile(jsx: string, extra = '') {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function Comp(props: { v: string; items: string[] }) {
      const [n, setN] = createSignal(0)
      ${extra}
      return ${jsx}
    }
  `
  return compileJSX(source, 'Comp.tsx', { adapter })
}

const clientJs = (r: ReturnType<typeof compile>) => r.files.find(f => f.type === 'clientJs')?.content ?? ''
const refusals = (r: ReturnType<typeof compile>) => r.errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

describe('raw-text host expression children', () => {
  for (const tag of ['style', 'script', 'textarea', 'title']) {
    test(`<${tag}>{n()}</${tag}> renders no slot marker and rewrites the element`, () => {
      const r = compile(`<div><${tag}>{'x' + n()}</${tag}></div>`)
      expect(r.errors).toEqual([])
      const js = clientJs(r)
      expect(js).toContain('.innerHTML = String(')
      // No comment-slot lookup for the text: the only slot is the element.
      expect(js).not.toContain('lazySlots')
      const tpl = r.files.find(f => f.type === 'markedTemplate')?.content ?? ''
      expect(tpl).not.toContain('bfText')
    })
  }

  test('a sibling <span> keeps its comment slot', () => {
    const r = compile(`<div><style>{'x' + n()}</style><span>{n()}</span></div>`)
    expect(clientJs(r)).toContain('lazySlots')
  })

  test('static prop text gets no client effect', () => {
    const r = compile(`<div><title>{props.v}</title></div>`)
    expect(r.errors).toEqual([])
  })
})

describe('raw-text host shapes that are refused', () => {
  test('a conditional child', () => {
    expect(refusals(compile(`<div><style>{n() ? 'a' : 'b'}</style></div>`)).length).toBe(1)
  })

  test('an element child', () => {
    expect(refusals(compile(`<div><textarea><b>x</b></textarea></div>`)).length).toBe(1)
  })

  test('a /* @client */ expression child', () => {
    expect(refusals(compile(`<div><style>{/* @client */ n()}</style></div>`)).length).toBe(1)
  })

  test('reactive text inside a loop row', () => {
    expect(refusals(compile(`<div>{props.items.map(i => <style key={i}>{i + n()}</style>)}</div>`)).length).toBe(1)
  })
})

describe('raw-text host is HTML-namespace only', () => {
  test('SVG <title> / <style> keep their slot markers and are not refused', () => {
    const r = compile(`<svg><title>{n()}</title><style>{'a' + n()}</style></svg>`)
    expect(r.errors).toEqual([])
    expect(clientJs(r)).toContain('lazySlots')
    expect(clientJs(r)).not.toContain('.innerHTML = String(')
  })

  test('a loop row under an SVG <title> is allowed', () => {
    const r = compile(`<svg><title>{props.items.map(i => <b key={i}>{i}</b>)}</title></svg>`)
    expect(refusals(r)).toEqual([])
  })

  test('<style> inside <foreignObject> is an HTML host again', () => {
    const r = compile(`<svg><foreignObject><style>{'a' + n()}</style></foreignObject></svg>`)
    expect(clientJs(r)).toContain('.innerHTML = String(')
  })
})

describe('raw-text host update wiring is refused where it is not wired', () => {
  for (const tag of ['style', 'script', 'textarea', 'title']) {
    test(`reactive <${tag}> content in a conditional branch`, () => {
      const r = compile(`<div>{n() > 0 ? <${tag}>{'x' + n()}</${tag}> : <span>off</span>}</div>`)
      expect(refusals(r).length).toBe(1)
    })
  }

  test('static <textarea> content in a conditional branch renders bare', () => {
    const r = compile(`<div>{n() > 0 ? <textarea>{'static'}</textarea> : <span>off</span>}</div>`)
    expect(r.errors).toEqual([])
  })

  test('a loop row value, even with no signal read (same-key replacement)', () => {
    const r = compile(`<div>{props.items.map(i => <textarea key={i}>{i}</textarea>)}</div>`)
    expect(refusals(r).length).toBe(1)
  })
})

describe('<annotation-xml> is an HTML integration point only for HTML encodings', () => {
  const inMath = (attrs: string) =>
    compile(`<math><annotation-xml${attrs}><title>{'x' + n()}</title></annotation-xml></math>`)

  test('no encoding: foreign, markers retained, no refusal', () => {
    const r = inMath('')
    expect(r.errors).toEqual([])
    expect(clientJs(r)).toContain('lazySlots')
  })

  test('a non-HTML encoding: foreign, markers retained', () => {
    const r = inMath(' encoding="application/x-tex"')
    expect(r.errors).toEqual([])
    expect(clientJs(r)).toContain('lazySlots')
  })

  for (const enc of ['text/html', 'Application/XHTML+xml']) {
    test(`encoding="${enc}": HTML host, markers removed`, () => {
      const r = inMath(` encoding="${enc}"`)
      expect(r.errors).toEqual([])
      expect(clientJs(r)).toContain('.innerHTML = String(')
      expect(clientJs(r)).not.toContain('lazySlots')
    })
  }

  test('a dynamic encoding is treated as HTML (the host rules are valid on both sides)', () => {
    const r = inMath(' encoding={props.v}')
    expect(clientJs(r)).toContain('.innerHTML = String(')
  })

  test('a conditional child under an HTML annotation-xml is refused, under a foreign one it is not', () => {
    const html = compile(`<math><annotation-xml encoding="text/html"><title>{n() ? 'a' : 'b'}</title></annotation-xml></math>`)
    expect(refusals(html).length).toBe(1)
    const foreign = compile(`<math><annotation-xml><title>{n() ? 'a' : 'b'}</title></annotation-xml></math>`)
    expect(foreign.errors).toEqual([])
  })
})
