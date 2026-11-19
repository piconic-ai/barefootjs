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

/**
 * #3937: `html/template` reads `<title>` / `<textarea>` as RCDATA whatever the
 * namespace and escapes every `<` there, so the slot markers of a reactive
 * child in SVG / MathML content can't be emitted. They are refused (BF101)
 * instead of rendering as visible text; shapes that need no marker still render.
 */
describe('GoTemplateAdapter - <title> / <textarea> in foreign content (#3937)', () => {
  const codes = (jsx: string) => compile(`
export function T({ tip }: { tip: string }) {
  return ${jsx}
}
`).errors.map(e => e.code)

  const shapes: Record<string, string> = {
    'SVG title': '<svg><title>{tip}</title></svg>',
    'SVG title with text and a prop': '<svg><title>a{tip}</title></svg>',
    'SVG textarea': '<svg><textarea>{tip}</textarea></svg>',
    'MathML title': '<math><title>{tip}</title></math>',
    'annotation-xml title without an encoding': '<math><annotation-xml><title>{tip}</title></annotation-xml></math>',
    'annotation-xml title with a non-HTML encoding': '<math><annotation-xml encoding="application/x-tex"><title>{tip}</title></annotation-xml></math>',
    'title of an svg nested in an HTML foreignObject': '<svg><foreignObject><svg><title>{tip}</title></svg></foreignObject></svg>',
    'title of an svg directly under annotation-xml': '<math><annotation-xml><svg><title>{tip}</title></svg></annotation-xml></math>',
    'an element child': '<svg><title><b>x</b></title></svg>',
    'a conditional child': '<svg><title>{tip ? <b>x</b> : null}</title></svg>',
  }
  for (const [name, jsx] of Object.entries(shapes)) {
    test(`${name} is refused`, () => {
      expect(codes(jsx)).toContain('BF101')
    })
  }

  const renders: Record<string, string> = {
    'literal SVG title text': '<svg><title>Chart</title></svg>',
    'a constant expression in an SVG title': "<svg><title>{'a'}{'b'}</title></svg>",
    'literal SVG textarea text': '<svg><textarea>x</textarea></svg>',
    'a prop in an HTML title': '<div><title>{tip}</title></div>',
    'a prop in the title of an SVG foreignObject': '<svg><foreignObject><title>{tip}</title></foreignObject></svg>',
    'a prop in the title of an SVG desc': '<svg><desc><title>{tip}</title></desc></svg>',
    'a prop in a text/html annotation-xml title': '<math><annotation-xml encoding="text/html"><title>{tip}</title></annotation-xml></math>',
    'a prop in the title of a MathML mi': '<math><mi><title>{tip}</title></mi></math>',
    'a prop in an SVG desc': '<svg><desc>{tip}</desc></svg>',
  }
  for (const [name, jsx] of Object.entries(renders)) {
    test(`${name} renders`, () => {
      expect(codes(jsx)).toEqual([])
    })
  }
})
