/**
 * #3810: html/template parses `<style>` / `<script>` text as CSS / JS and
 * escapes an action there (`ZgotmplZ`, quoted JS strings). A dynamic child of
 * these elements is refused with BF101; literal text still renders.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const compile = (source: string) =>
  compileJSX(source.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })

describe('GoTemplateAdapter - dynamic text in <style> / <script> (#3810)', () => {
  for (const tag of ['style', 'script']) {
    test(`a prop in <${tag}> is refused`, () => {
      const { errors } = compile(`
export function T({ v }: { v: string }) {
  return <div><${tag}>{v}</${tag}></div>
}
`)
      expect(errors.map(e => e.code)).toContain('BF101')
    })

    test(`a prop inside a fragment in <${tag}> is refused`, () => {
      const { errors } = compile(`
export function T({ v }: { v: string }) {
  return <div><${tag}><>a{v}</></${tag}></div>
}
`)
      expect(errors.map(e => e.code)).toContain('BF101')
    })

    test(`literal text in <${tag}> renders`, () => {
      const { errors } = compile(`
export function T() {
  return <div><${tag}>a b</${tag}></div>
}
`)
      expect(errors).toEqual([])
    })
  }

  test('a /* @client */ expression in <style> is refused too', () => {
    const { errors } = compile(`
export function T({ v }: { v: string }) {
  return <div><style>{/* @client */ v}</style></div>
}
`)
    expect(errors.map(e => e.code)).toContain('BF101')
  })

  test('a prop in a non-raw element is not refused', () => {
    const { errors } = compile(`
export function T({ v }: { v: string }) {
  return <div><p>{v}</p></div>
}
`)
    expect(errors).toEqual([])
  })
})
