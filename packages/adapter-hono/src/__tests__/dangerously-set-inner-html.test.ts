/**
 * Hono adapter jsx-runtime: `dangerouslySetInnerHTML` with no children (#2557).
 *
 * hono's own `jsxFn` (see `hono/dist/jsx/base.js`) always wraps `<svg>` /
 * `<head>` children in an internal namespace-context node, even when the
 * caller passed no real children. That phantom wrapper makes hono's own
 * `children.length > 0` guard true, so any *childless* `<svg>`/`<head>`
 * element using `dangerouslySetInnerHTML` tripped hono's
 * "Can only set one of `children` or `props.dangerouslySetInnerHTML`"
 * error — even though there were no real children to conflict with.
 *
 * `../jsx/jsx-runtime/index.ts` and `../jsx/jsx-dev-runtime/index.ts` work
 * around this by resolving `dangerouslySetInnerHTML` into real `children`
 * themselves before delegating to hono, whenever no explicit `children`
 * prop is present. This pins that fix at the runtime-function level (the
 * layer BarefootJS's compiled SSR output actually calls into) and confirms
 * genuine children+dangerouslySetInnerHTML conflicts are still rejected.
 */
import { describe, test, expect } from 'bun:test'
import { jsx, jsxs } from '../jsx/jsx-runtime/index.ts'
import { jsxDEV } from '../jsx/jsx-dev-runtime/index.ts'

describe('dangerouslySetInnerHTML with no children (#2557)', () => {
  test('jsx: <svg dangerouslySetInnerHTML> with no children does not throw', () => {
    const html = String(jsx('svg', { dangerouslySetInnerHTML: { __html: '<path d="M1"/>' } }))
    expect(html).toBe('<svg><path d="M1"/></svg>')
  })

  test('jsx: <head dangerouslySetInnerHTML> with no children does not throw', () => {
    const html = String(jsx('head', { dangerouslySetInnerHTML: { __html: '<meta charset="utf-8">' } }))
    expect(html).toBe('<head><meta charset="utf-8"></head>')
  })

  test('jsx: ordinary tags with dangerouslySetInnerHTML still work', () => {
    const html = String(jsx('div', { dangerouslySetInnerHTML: { __html: '<b>hi</b>' } }))
    expect(html).toBe('<div><b>hi</b></div>')
  })

  test('jsxs: <svg dangerouslySetInnerHTML> with no children does not throw', () => {
    const html = String(jsxs('svg', { dangerouslySetInnerHTML: { __html: '<circle r="1"/>' } }))
    expect(html).toBe('<svg><circle r="1"/></svg>')
  })

  test('jsxDEV: <svg dangerouslySetInnerHTML> with no children does not throw', () => {
    const html = String(jsxDEV('svg', { dangerouslySetInnerHTML: { __html: '<rect/>' } }))
    expect(html).toBe('<svg><rect/></svg>')
  })

  test('genuine conflict — both children and dangerouslySetInnerHTML — still throws', () => {
    expect(() =>
      String(jsx('span', { dangerouslySetInnerHTML: { __html: 'x' }, children: 'real' }))
    ).toThrow('Can only set one of `children` or `props.dangerouslySetInnerHTML`.')
  })
})
