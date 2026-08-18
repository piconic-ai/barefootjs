/**
 * Runtime unit test for `parseHTML`'s MathML wrap (#1096 — port of #135's
 * SVG wrap).
 *
 * `template.innerHTML = '<mrow/>'` parses in the HTML namespace, cloning
 * as an `HTMLUnknownElement` (xhtml namespace) rather than a
 * `MathMLElement` — the same HTML5-parser foreign-content quirk the SVG
 * wrap (`parent.namespaceURI === SVG_NS`) already handles in
 * `src/runtime/component.ts`.
 *
 * KNOWN ENVIRONMENT GAP: happy-dom's HTML parser (`HTMLParser.js`,
 * `getStartTagElement`) only special-cases the `svg` tag name / inherited
 * SVG namespace to enter foreign content — there is no equivalent `math`
 * branch, confirmed by reading the parser source (v20.11.2). So even with
 * the correct wrap, `template.innerHTML = '<math>...</math>'` still comes
 * back as a plain `HTMLUnknownElement` tree under happy-dom (verified with
 * a standalone sanity check before writing this test) — real browsers
 * implement the MathML insertion mode per the HTML5 parsing spec (the same
 * mechanism that makes the SVG case work here), happy-dom does not. So the
 * SVG sibling test below asserts the RESULTING namespaceURI (happy-dom
 * supports that), while the MathML tests here assert the WRAP DECISION
 * itself — that `parseHTML` sets `<math>...</math>` as the parsed markup
 * when `parent` lives in the MathML namespace — by capturing the
 * `<template>`'s `innerHTML` assignment. That is the exact statement the
 * production code executes; only the parser's downstream interpretation of
 * it is where happy-dom's fidelity gap lives.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const SVG_NS = 'http://www.w3.org/2000/svg'
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

/**
 * Spy on `document.createElement('template')` for the duration of `fn`,
 * capturing every string assigned to the returned template's `innerHTML`.
 * Restores the original `createElement` afterwards regardless of outcome.
 */
function captureTemplateInnerHTML(fn: () => void): string[] {
  const captured: string[] = []
  const original = document.createElement.bind(document)
  // @ts-expect-error -- test-only monkeypatch, restored in `finally`.
  document.createElement = (tagName: string, options?: unknown) => {
    const el = original(tagName, options as ElementCreationOptions)
    if (tagName === 'template') {
      const proto = Object.getPrototypeOf(el)
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML')
        ?? Object.getOwnPropertyDescriptor(HTMLTemplateElement.prototype, 'innerHTML')
      if (descriptor?.set && descriptor?.get) {
        Object.defineProperty(el, 'innerHTML', {
          configurable: true,
          get: () => descriptor.get!.call(el),
          set: (value: string) => {
            captured.push(value)
            descriptor.set!.call(el, value)
          },
        })
      }
    }
    return el
  }
  try {
    fn()
  } finally {
    document.createElement = original
  }
  return captured
}

describe('#1096 — parseHTML MathML namespace wrap', () => {
  test('a MathML parent wraps the parsed markup in <math>...</math>', async () => {
    const { parseHTML } = await import('../../src/runtime/component')
    const mathParent = document.createElementNS(MATHML_NS, 'math')

    const captured = captureTemplateInnerHTML(() => {
      parseHTML('<mrow><mn>1</mn></mrow>', mathParent)
    })

    expect(captured).toHaveLength(1)
    expect(captured[0]).toBe('<math><mrow><mn>1</mn></mrow></math>')
  })

  test('an HTML parent (or no parent) keeps the bare parse — no <math> wrap', async () => {
    const { parseHTML } = await import('../../src/runtime/component')
    const htmlParent = document.createElement('div')

    const captured = captureTemplateInnerHTML(() => {
      parseHTML('<mrow><mn>1</mn></mrow>', htmlParent)
    })

    expect(captured).toHaveLength(1)
    expect(captured[0]).toBe('<mrow><mn>1</mn></mrow>')
  })

  test('an SVG parent parses markup in the SVG namespace (happy-dom supports this natively)', async () => {
    const { parseHTML } = await import('../../src/runtime/component')
    const svgParent = document.createElementNS(SVG_NS, 'svg')
    const frag = parseHTML('<circle r="5" />', svgParent)
    const circle = frag.firstElementChild
    expect(circle).not.toBeNull()
    expect(circle!.namespaceURI).toBe(SVG_NS)
  })
})
