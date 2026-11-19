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

describe('integration points are namespace-specific (SVG vs MathML)', () => {
  const host = (wrapper: string) => compile(wrapper.replace('X', `<style>{'x' + n()}</style>`))

  test('an SVG foreignObject / desc / title is an HTML integration point: the host is lowered', () => {
    for (const tag of ['foreignObject', 'desc', 'title']) {
      const r = host(`<svg><${tag}>X</${tag}></svg>`)
      expect(r.errors).toEqual([])
      expect(clientJs(r)).toContain('.innerHTML = String(')
    }
  })

  test('a MathML mi / mo / mn / ms / mtext is a text integration point: the host is lowered', () => {
    for (const tag of ['mi', 'mo', 'mn', 'ms', 'mtext']) {
      const r = host(`<math><${tag}>X</${tag}></math>`)
      expect(r.errors).toEqual([])
      expect(clientJs(r)).toContain('.innerHTML = String(')
    }
  })

  test('a MathML text integration point is NOT one inside an SVG, nor an SVG one inside MathML', () => {
    for (const w of ['<svg><mi>X</mi></svg>', '<math><desc>X</desc></math>', '<math><foreignObject>X</foreignObject></math>']) {
      const r = host(w)
      expect(r.errors).toEqual([])
      expect(clientJs(r)).toContain('lazySlots')
      expect(clientJs(r)).not.toContain('.innerHTML = String(')
    }
  })
})

describe('an svg directly under a MathML annotation-xml enters the SVG namespace whatever the encoding', () => {
  const nested = (attrs: string) =>
    compile(`<math><annotation-xml${attrs}><svg><title><style>{'x' + n()}</style></title></svg></annotation-xml></math>`)

  for (const attrs of ['', ' encoding="application/x-tex"', ' encoding="text/html"']) {
    test(`annotation-xml${attrs}: the SVG title is an HTML integration point, so the style is a host`, () => {
      const r = nested(attrs)
      expect(r.errors).toEqual([])
      expect(clientJs(r)).toContain('.innerHTML = String(')
      expect(clientJs(r)).not.toContain('lazySlots')
    })
  }

  test('the transition applies only to a DIRECT svg child of annotation-xml', () => {
    const r = compile(`<math><annotation-xml><mrow><svg><title><style>{'x' + n()}</style></title></svg></mrow></annotation-xml></math>`)
    expect(r.errors).toEqual([])
    expect(clientJs(r)).toContain('lazySlots')
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

  test('an encoding that may come from an attribute spread is treated as HTML', () => {
    const r = inMath(' {...props.attrs}')
    expect(r.errors).toEqual([])
    expect(clientJs(r)).toContain('.innerHTML = String(')
    expect(clientJs(r)).not.toContain('lazySlots')
  })

  test('a literal non-HTML encoding that a later spread may override is treated as HTML', () => {
    const r = inMath(' encoding="application/x-tex" {...props.attrs}')
    expect(r.errors).toEqual([])
    expect(clientJs(r)).toContain('.innerHTML = String(')
    expect(clientJs(r)).not.toContain('lazySlots')
  })

  test('a conditional child under an HTML annotation-xml is refused, under a foreign one it is not', () => {
    const html = compile(`<math><annotation-xml encoding="text/html"><title>{n() ? 'a' : 'b'}</title></annotation-xml></math>`)
    expect(refusals(html).length).toBe(1)
    const foreign = compile(`<math><annotation-xml><title>{n() ? 'a' : 'b'}</title></annotation-xml></math>`)
    expect(foreign.errors).toEqual([])
  })
})

describe('raw-text tags in foreign content are flagged, not lowered (#3937)', () => {
  /** The `tag` of every IR element carrying `foreignRawTextTag`, in document order. */
  function flaggedTags(jsx: string): string[] {
    const r = compileJSX(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Comp(props: { v: string }) {
        const [n] = createSignal(0)
        return ${jsx}
      }
    `,
      'Comp.tsx',
      { adapter, outputIR: true },
    )
    expect(r.errors).toEqual([])
    const out: string[] = []
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit)
      if (value === null || typeof value !== 'object') return
      const node = value as Record<string, unknown>
      if (node.type === 'element' && node.foreignRawTextTag === true) out.push(String(node.tag))
      for (const child of Object.values(node)) visit(child)
    }
    visit(JSON.parse(r.files.find(f => f.type === 'ir')!.content))
    return out
  }

  test('an SVG title / textarea / style / script is flagged and keeps its slot', () => {
    expect(flaggedTags(`<svg><title>{n()}</title><textarea>{n()}</textarea><style>x</style><script>y</script></svg>`)).toEqual([
      'title',
      'textarea',
      'style',
      'script',
    ])
  })

  test('a MathML title is flagged, also under annotation-xml without an HTML encoding', () => {
    expect(flaggedTags(`<math><annotation-xml><title>{n()}</title></annotation-xml></math>`)).toEqual(['title'])
    expect(flaggedTags(`<math><annotation-xml encoding="application/x-tex"><title>{n()}</title></annotation-xml></math>`)).toEqual(['title'])
    expect(flaggedTags(`<math><title>{n()}</title></math>`)).toEqual(['title'])
  })

  test('an HTML title is a host, not flagged: under HTML, an SVG integration point, a text/html annotation-xml', () => {
    expect(flaggedTags(`<div><title>{n()}</title></div>`)).toEqual([])
    expect(flaggedTags(`<svg><foreignObject><title>{n()}</title></foreignObject></svg>`)).toEqual([])
    expect(flaggedTags(`<svg><desc><textarea>{n()}</textarea></desc></svg>`)).toEqual([])
    expect(flaggedTags(`<math><annotation-xml encoding="text/html"><title>{n()}</title></annotation-xml></math>`)).toEqual([])
    expect(flaggedTags(`<math><mi><title>{n()}</title></mi></math>`)).toEqual([])
  })

  test('a nested svg re-enters foreign content: its title is flagged', () => {
    expect(flaggedTags(`<svg><foreignObject><svg><title>{n()}</title></svg></foreignObject></svg>`)).toEqual(['title'])
    expect(flaggedTags(`<math><annotation-xml><svg><title><textarea>{n()}</textarea></title></svg></annotation-xml></math>`)).toEqual(['title'])
  })
})
