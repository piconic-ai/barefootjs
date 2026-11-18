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
