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

  test('signal/prop-derived value resolves as dynamic and carries the inner expression (#2319)', () => {
    const el = rootElement(`
      function Test({ html }: { html: string }) { return <div dangerouslySetInnerHTML={{ __html: html }} /> }
      export { Test }
    `)
    const resolution = resolveDangerousInnerHtml(el)
    expect(resolution?.kind).toBe('dynamic')
    // The adapter lowers `valueExpr`/`valueParsed` (the inner `__html` value),
    // not the whole `{ __html: … }` object, through its raw-output sink.
    if (resolution?.kind !== 'dynamic') throw new Error('expected dynamic')
    expect(resolution.valueExpr).toBe('html')
    expect(resolution.valueParsed).toEqual({ kind: 'identifier', name: 'html' })
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

  test('extra property alongside __html resolves as unlowerable (not a { __html } object literal)', () => {
    const el = rootElement(`
      function Test() { return <div dangerouslySetInnerHTML={{ __html: '<b>x</b>', extra: 1 }} /> }
      export { Test }
    `)
    // Not the canonical single-property shape — no faithful lowering, so the
    // adapter refuses with BF101 (#2319 lowers a lone `{ __html: expr }`).
    expect(resolveDangerousInnerHtml(el)?.kind).toBe('unlowerable')
  })

  test('isDangerousInnerHtmlAttr only matches the exact prop name', () => {
    const el = rootElement(`
      function Test() { return <div data-foo="bar" dangerouslySetInnerHTML={{ __html: 'x' }} /> }
      export { Test }
    `)
    const names = el.attrs.map(a => a.name)
    expect(names.filter(n => isDangerousInnerHtmlAttr({ name: n } as never))).toEqual(['dangerouslySetInnerHTML'])
  })

  // Fable review (#2217): a `/* @client */`-deferred value is already a
  // working escape hatch — every adapter's own renderAttributes skips a
  // clientOnly attr, and the client's createEffect-driven innerHTML
  // assignment (emit-reactive.ts) runs regardless of SSR — so this module
  // must treat it as "render normally" (null), not refuse with BF101.
  // Refusing here was a real regression the review caught: it broke the
  // only path that made this module's own suggestion text achievable.
  test('/* @client */-deferred dangerouslySetInnerHTML resolves to null (render normally, defer to hydrate)', () => {
    const el = rootElement(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Test() {
        const [html, setHtml] = createSignal('<b>hi</b>')
        return <div dangerouslySetInnerHTML={/* @client */ { __html: html() }} />
      }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)).toBeNull()
  })

  test('empty-string literal resolves as static with an empty html value', () => {
    const el = rootElement(`
      function Test() { return <div dangerouslySetInnerHTML={{ __html: '' }} /> }
      export { Test }
    `)
    expect(resolveDangerousInnerHtml(el)).toEqual({ kind: 'static', html: '' })
  })
})

describe('dangerousInnerHtmlMetacharViolation (#2207)', () => {
  test('plain HTML is safe on every adapter', () => {
    for (const id of ['blade', 'erb', 'go-template', 'jinja', 'minijinja', 'mojolicious', 'twig', 'xslate']) {
      expect(dangerousInnerHtmlMetacharViolation('<b>bold</b> &amp; safe', id)).toBeNull()
    }
  })

  // Fable review (#2217): a 9th template adapter with no entry in the guard
  // table must fail CLOSED (refuse) rather than fail open (splice
  // unguarded) — the safe default when nobody has verified that adapter's
  // template syntax yet.
  test('unknown adapter id fails CLOSED (refuses) rather than open', () => {
    expect(dangerousInnerHtmlMetacharViolation('<b>plain html, no metachars</b>', 'not-a-real-adapter')).not.toBeNull()
  })

  const cases: Array<[adapterId: string, html: string]> = [
    ['blade', '<b>{{ $evil }}</b>'],
    ['blade', '<b>{!! $evil !!}</b>'],
    ['blade', '<?php echo 1; ?>'],
    ['blade', '@if(true)x@endif'],
    // Laravel's BladeCompiler compiles component tags by default — <x-foo>
    // resolves and renders a live Blade component, not template
    // substitution. The sharpest "not inert text" case in the table.
    ['blade', '<x-alert>evil</x-alert>'],
    ['blade', '</x-alert>'],
    ['erb', '<b><%= evil %></b>'],
    ['go-template', '<b>{{ .Evil }}</b>'],
    ['jinja', '<b>{{ evil }}</b>'],
    ['jinja', '<b>{% if x %}y{% endif %}</b>'],
    ['jinja', '<b>{# comment #}</b>'],
    ['minijinja', '<b>{{ evil }}</b>'],
    ['twig', '<b>{{ evil }}</b>'],
    ['mojolicious', '<b><%= evil %></b>'],
    ['mojolicious', '% my $x = 1;\n<b>hi</b>'],
    // Leading whitespace (not just a bare line start) before the line-code
    // marker, and the marker as the very first character of the string.
    ['mojolicious', '  % my $x = 1;\n<b>hi</b>'],
    ['mojolicious', '% my $x = 1;'],
    ['xslate', '<b><: $evil :></b>'],
    ['xslate', ': my $x = 1;\n<b>hi</b>'],
    ['xslate', '  : my $x = 1;\n<b>hi</b>'],
    ['xslate', ': my $x = 1;'],
    // A literal that IS only the metachar sequence, nothing else.
    ['blade', '{{'],
    ['go-template', '{{'],
  ]
  for (const [adapterId, html] of cases) {
    test(`${adapterId} refuses ${JSON.stringify(html)}`, () => {
      expect(dangerousInnerHtmlMetacharViolation(html, adapterId)).not.toBeNull()
    })
  }
})

describe('dangerousInnerHtmlDiagnostic (#2207)', () => {
  test('produces a BF101 with a purpose-built message', () => {
    const diag = dangerousInnerHtmlDiagnostic('true', { file: 'Test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } })
    expect(diag.code).toBe('BF101')
    expect(diag.severity).toBe('error')
    expect(diag.message).toContain('dangerouslySetInnerHTML expects an { __html: … } object literal')
    // A dynamic value is now lowered, not refused, so the escape-hatch text
    // points at the object-literal contract and /* @client */ (#2319).
    expect(diag.suggestion?.message).toContain('@client')
  })
})
