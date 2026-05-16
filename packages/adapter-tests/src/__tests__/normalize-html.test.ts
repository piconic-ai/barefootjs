import { describe, test, expect } from 'bun:test'
import { normalizeHTML } from '../jsx-runner'

describe('normalizeHTML — async placeholder strip', () => {
  test('removes a flat <div bf-async> placeholder, keeping the resolved siblings', () => {
    const html = '<div><div bf-async="a0"><p>Loading...</p></div><span>Resolved</span></div>'
    expect(normalizeHTML(html)).toBe('<div><span>Resolved</span></div>')
  })

  test('removes a placeholder whose fallback contains nested <div> without dangling </div>', () => {
    const html = '<div><div bf-async="a0"><div class="skeleton"><div>Loading...</div></div></div><span>Resolved</span></div>'
    expect(normalizeHTML(html)).toBe('<div><span>Resolved</span></div>')
  })

  test('strips multiple sibling placeholders in one pass', () => {
    const html = '<main><div bf-async="a0"><p>A</p></div><div bf-async="a1"><p>B</p></div><section>Done</section></main>'
    expect(normalizeHTML(html)).toBe('<main><section>Done</section></main>')
  })

  test('leaves unrelated <div> elements untouched', () => {
    const html = '<div class="root"><div bf-async="a0"><p>L</p></div><div class="card">Card</div></div>'
    expect(normalizeHTML(html)).toBe('<div class="root"><div class="card">Card</div></div>')
  })

  test('placeholder containing a void <br/> in its fallback closes correctly', () => {
    const html = '<div bf-async="a0">Wait<br/>just a moment</div><span>Done</span>'
    expect(normalizeHTML(html)).toBe('<span>Done</span>')
  })

  test('attribute order — `bf-async` not first does not silently no-op the strip', () => {
    const html = '<div class="root"><div data-foo="x" bf-async="a0"><p>Loading...</p></div><span>Resolved</span></div>'
    expect(normalizeHTML(html)).toBe('<div class="root"><span>Resolved</span></div>')
  })

  test('tag-name word boundary — `<divider>` / `<div-foo>` are not counted as `<div>` openers', () => {
    const html = '<section><divider>x</divider><div-foo>y</div-foo><div bf-async="a0"><p>L</p></div><span>R</span></section>'
    // The unrelated <divider> / <div-foo> tags must survive intact, and
    // the placeholder strip must terminate at its own `</div>` — not get
    // confused by the `</divider>` close.
    expect(normalizeHTML(html)).toBe('<section><divider>x</divider><div-foo>y</div-foo><span>R</span></section>')
  })

  test('self-closing `<div ... />` in fallback contributes zero net depth', () => {
    // Without self-closing handling, `<div class="skeleton"/>` would
    // increment depth without a matching `</div>`, so the strip would
    // consume past the intended placeholder close and swallow the
    // sibling `<span>`.
    const html = '<div bf-async="a0"><div class="skeleton"/></div><span>Resolved</span>'
    expect(normalizeHTML(html)).toBe('<span>Resolved</span>')
  })

  test('self-closing div with trailing space still resolves correctly', () => {
    const html = '<div bf-async="a0"><div class="skeleton" /></div><span>R</span>'
    expect(normalizeHTML(html)).toBe('<span>R</span>')
  })
})
