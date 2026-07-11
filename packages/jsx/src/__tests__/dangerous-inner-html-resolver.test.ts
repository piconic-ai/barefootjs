import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import {
  isDangerousInnerHtmlAttr,
  resolveDangerousInnerHtml,
  dangerousInnerHtmlMetacharViolation,
  dangerousInnerHtmlDiagnostic,
} from '../adapters/dangerous-inner-html'

// #2207: the shared `dangerouslySetInnerHTML` resolver — recognition,
// static-literal extraction, and per-adapter template-metacharacter
// guarding all live in one place (packages/jsx/src/adapters/dangerous-inner-html.ts)
// so every template adapter shares identical, single-source-of-truth policy.
describe('resolveDangerousInnerHtml (#2207)', () => {
  function rootElement(source: string) {
    const ctx = analyzeComponent(source, 'Test.tsx')
    const ir = jsxToIR(ctx)
    if (!ir || ir.type !== 'element') throw new Error('expected a root element')
    return ir
  }

  test('absent attribute resolves to null', () => {
    const el = rootElement(`
      function Test() { return <div>hi</div> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)).toBeNull()
  })

  test('inline string literal resolves as static', () => {
    const el = rootElement(`
      function Test() { return <div dangerouslySetInnerHTML={{ __html: '<b>bold</b> &amp; safe' }} /> }
      export { Test }
    `)
    const resolution = resolveDangerousInnerHtml(el)
    expect(resolution).toEqual({ kind: 'static', html: '<b>bold</b> &amp; safe' })
  })

  test('string-key form ({ "__html": ... }) resolves identically to the identifier-key form', () => {
    const el = rootElement(`
      function Test() { return <div dangerouslySetInnerHTML={{ '__html': '<i>x</i>' }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)).toEqual({ kind: 'static', html: '<i>x</i>' })
  })

  test('signal/prop-derived value resolves as dynamic', () => {
    const el = rootElement(`
      function Test({ html }: { html: string }) { return <div dangerouslySetInnerHTML={{ __html: html }} /> }
      export { Test }
    `)
    const resolution = resolveDangerousInnerHtml(el)
    expect(resolution?.kind).toBe('dynamic')
  })

  test('a no-substitution template literal resolves as static (identical to a string literal)', () => {
    const el = rootElement(`
      function Test() { return <div dangerouslySetInnerHTML={{ __html: \`<b>bold</b>\` }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)).toEqual({ kind: 'static', html: '<b>bold</b>' })
  })

  test('a template literal WITH a substitution resolves as dynamic — no const-folding in v1', () => {
    const el = rootElement(`
      function Test({ tag }: { tag: string }) { return <div dangerouslySetInnerHTML={{ __html: \`<\${tag}>bold</\${tag}>\` }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)?.kind).toBe('dynamic')
  })

  test('shorthand { __html } resolves as dynamic, not the literal named __html', () => {
    const el = rootElement(`
      function Test({ __html }: { __html: string }) { return <div dangerouslySetInnerHTML={{ __html }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)?.kind).toBe('dynamic')
  })

  test('local const reference resolves as dynamic — v1 requires an INLINE literal', () => {
    const el = rootElement(`
      const HTML = '<b>bold</b>'
      function Test() { return <div dangerouslySetInnerHTML={{ __html: HTML }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)?.kind).toBe('dynamic')
  })

  test('extra property alongside __html resolves as dynamic', () => {
    const el = rootElement(`
      function Test() { return <div dangerouslySetInnerHTML={{ __html: '<b>x</b>', extra: 1 }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)?.kind).toBe('dynamic')
  })

  test('isDangerousInnerHtmlAttr only matches the exact prop name', () => {
    const el = rootElement(`
      function Test() { return <div data-foo="bar" dangerouslySetInnerHTML={{ __html: 'x' }} /> }
      export { Test }
    `)
    const names = el.attrs.map(a => a.name)
    expect(names.filter(n => isDangerousInnerHtmlAttr({ name: n } as never))).toEqual(['dangerouslySetInnerHTML'])
  })
})

describe('dangerousInnerHtmlMetacharViolation (#2207)', () => {
  test('plain HTML is safe on every adapter', () => {
    for (const id of ['blade', 'erb', 'go-template', 'jinja', 'minijinja', 'mojolicious', 'twig', 'xslate']) {
      expect(dangerousInnerHtmlMetacharViolation('<b>bold</b> &amp; safe', id)).toBeNull()
    }
  })

  test('unknown adapter id is a no-op (returns null)', () => {
    expect(dangerousInnerHtmlMetacharViolation('<b>{{ anything }}</b>', 'not-a-real-adapter')).toBeNull()
  })

  const cases: Array<[adapterId: string, html: string]> = [
    ['blade', '<b>{{ $evil }}</b>'],
    ['blade', '<b>{!! $evil !!}</b>'],
    ['blade', '<?php echo 1; ?>'],
    ['blade', '@if(true)x@endif'],
    ['erb', '<b><%= evil %></b>'],
    ['go-template', '<b>{{ .Evil }}</b>'],
    ['jinja', '<b>{{ evil }}</b>'],
    ['jinja', '<b>{% if x %}y{% endif %}</b>'],
    ['jinja', '<b>{# comment #}</b>'],
    ['minijinja', '<b>{{ evil }}</b>'],
    ['twig', '<b>{{ evil }}</b>'],
    ['mojolicious', '<b><%= evil %></b>'],
    ['mojolicious', '% my $x = 1;\n<b>hi</b>'],
    ['xslate', '<b><: $evil :></b>'],
    ['xslate', ': my $x = 1;\n<b>hi</b>'],
  ]
  for (const [adapterId, html] of cases) {
    test(`${adapterId} refuses ${JSON.stringify(html)}`, () => {
      expect(dangerousInnerHtmlMetacharViolation(html, adapterId)).not.toBeNull()
    })
  }
})

describe('dangerousInnerHtmlDiagnostic (#2207)', () => {
  test('produces a BF101 with a purpose-built message', () => {
    const diag = dangerousInnerHtmlDiagnostic('html', { file: 'Test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } })
    expect(diag.code).toBe('BF101')
    expect(diag.severity).toBe('error')
    expect(diag.message).toContain('dangerouslySetInnerHTML requires an inline')
    expect(diag.suggestion?.message).toContain('2215')
  })
})
