import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'
import siteUnoConfig from '../../../../site/ui/uno.config'

const toggleGroupSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('ToggleGroup', () => {
  const result = renderToTest(toggleGroupSource, 'toggle-group.tsx', 'ToggleGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is ToggleGroup', () => {
    expect(result.componentName).toBe('ToggleGroup')
  })

  test('has signals: internalValue, controlledValue (createSignal)', () => {
    expect(result.signals).toContain('internalValue')
    expect(result.signals).toContain('controlledValue')
  })

  test('isControlled and currentValue are memos, not in signals', () => {
    expect(result.memos).toContain('isControlled')
    expect(result.memos).toContain('currentValue')
    expect(result.signals).not.toContain('isControlled')
    expect(result.signals).not.toContain('currentValue')
  })

  test('has role=group', () => {
    const group = result.find({ role: 'group' })
    expect(group).not.toBeNull()
  })

  test('root div has data-slot=toggle-group', () => {
    const div = result.find({ tag: 'div' })
    expect(div!.props['data-slot']).toBe('toggle-group')
  })
})

describe('ToggleGroupItem', () => {
  const result = renderToTest(toggleGroupSource, 'toggle-group.tsx', 'ToggleGroupItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ToggleGroupItem', () => {
    expect(result.componentName).toBe('ToggleGroupItem')
  })

  test('renders as <button>', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
  })

  test('has aria-pressed attribute', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('pressed')
  })

  test('has data-state attribute', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.dataState).not.toBeNull()
  })

  // An item cannot know its group's variant/size at SSR (context is
  // client-only), so its styling keys off the group root's own
  // `data-variant` / `data-size` rather than item attributes a mount ref
  // would add at hydration (BF063).
  test('variant/size styling keys off the group root, not item data attributes', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.classes).toContain('group-data-[variant=outline]/toggle-group:border')
    expect(button.classes).toContain('group-data-[size=sm]/toggle-group:h-8')
    expect(button.classes).toContain('group-data-[size=lg]/toggle-group:h-10')
    expect(button.classes.filter(c => c.startsWith('data-[variant=') || c.startsWith('data-[size='))).toEqual([])
    expect(button.props).not.toHaveProperty('data-variant')
    expect(button.props).not.toHaveProperty('data-size')
  })

  // The class-string assertions above cannot see whether UnoCSS actually
  // emits a rule for a named-group token — and the stacked forms
  // (`…/toggle-group:hover:bg-accent`, `…/toggle-group:first:border-l`) are
  // the only named-group + further-variant tokens in the repo. Run the
  // site's real generator over every one, raw and with the
  // `layer-components:` prefix the site build applies, and check each rule
  // targets the item under the group root's `data-*` plus any stacked
  // pseudo-class.
  test('every group-data-[…]/toggle-group: token generates a rule under the group root', async () => {
    const button = result.find({ tag: 'button' })!
    const tokens = button.classes.filter(c => c.startsWith('group-data-[') && c.includes('/toggle-group:'))
    expect(tokens.length).toBe(16)
    // `unocss` is a dependency of `site/ui` (which owns this config), not of
    // `ui` — resolve it from there, so the generator is the one the site
    // build runs.
    const { createGenerator } = (await import(
      Bun.resolveSync('unocss', resolve(__dirname, '../../../../site/ui'))
    )) as typeof import('unocss')
    const uno = await createGenerator({ ...siteUnoConfig, preflights: [], safelist: [] })
    for (const token of tokens) {
      const [, attr, value, rest] = token.match(/^group-data-\[(\w+)=(\w+)\]\/toggle-group:(.+)$/)!
      const pseudo = rest.startsWith('hover:') ? ':hover' : rest.startsWith('first:') ? ':first-child' : ''
      for (const cls of [token, `layer-components:${token}`]) {
        const { css, matched } = await uno.generate(new Set([cls]), { preflights: false })
        expect(matched.has(cls)).toBe(true)
        expect(css).toContain(`&:is(:where(.group\\/toggle-group)[data-${attr}=${value}] *){`)
        const selectorLine = css.split('\n').find(l => l.startsWith('.') && l.includes('toggle-group'))!
        expect(selectorLine).toMatch(pseudo ? new RegExp(`${pseudo}\\{`) : /[^:]\{/)
        if (!pseudo) expect(selectorLine).not.toMatch(/:(hover|first-child)\{/)
      }
    }
  })
})
