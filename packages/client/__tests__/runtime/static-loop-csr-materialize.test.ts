/**
 * Runtime regression test for #1247.
 *
 * Verifies the end-to-end behaviour of the static-loop CSR self-heal:
 * compile a component whose static-array loop reads from props, register
 * its `template:` + `init:` via the real runtime's `hydrate`, mount via
 * `createComponent`, and assert the resulting DOM contains the per-item
 * elements. Without the fix, `createComponent` returns an empty container
 * because the CSR template substitutes `[].map(...)`.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const adapter = new TestAdapter()

async function compileAndEvalClientJs(source: string, filename: string): Promise<void> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors in ${filename}:\n${errors.map(e => e.message).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')

  // Rewrite the runtime imports to absolute paths so dynamic `import()`
  // resolves them from a temp directory without needing a workspace
  // resolver. Strip `@bf-child` registry placeholder imports so the
  // generated module loads under `import()` without a workspace bundler.
  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-1247-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
}

describe('#1247 — createComponent on static-loop with prop-derived array', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('materialises children when CSR template substitutes the array with []', async () => {
    const source = `
      'use client'
      type Props = { reactions: Record<string, string[]> }
      export function ReactionBar(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div data-reaction-bar="true">
            {entries.map(([emoji, users]) => (
              <button key={emoji} type="button">
                <span>{emoji}</span>
                <span>{String(users.length)}</span>
              </button>
            ))}
          </div>
        )
      }
    `
    await compileAndEvalClientJs(source, 'ReactionBar.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('ReactionBar', {
      reactions: { '👍': ['alice', 'bob'], '🎉': ['alice'] },
    }) as Element
    document.body.appendChild(el)

    expect(el.getAttribute('data-reaction-bar')).toBe('true')
    const buttons = el.querySelectorAll('button')
    expect(buttons.length).toBe(2)
    // Each button has two `<span>` children for emoji + count.
    expect(buttons[0].querySelectorAll('span').length).toBe(2)
    expect(buttons[0].textContent).toContain('👍')
    expect(buttons[0].textContent).toContain('2')
    expect(buttons[1].textContent).toContain('🎉')
    expect(buttons[1].textContent).toContain('1')
  })

  test('#1268 — childComponent body materialises rendered children', async () => {
    // Loop body is a single child component reading a prop-derived
    // `entries`. Before #1268 the materialize gate excluded
    // childComponent loops, so `createComponent` mounts rendered an
    // empty `<ul>`. The fix builds a per-iteration template that
    // evaluates `${renderChild('Tag', ..., key)}`; the resulting child
    // HTML lands inside the container and `static-array-child-inits`
    // wires it via `initChild`.
    const tagSource = `
      'use client'
      export function Tag(props: { id: string; variant: 'on' | 'off' }) {
        return <span class={'tag-' + props.variant}>{props.id}</span>
      }
    `
    await compileAndEvalClientJs(tagSource, 'Tag.tsx')
    const listSource = `
      'use client'
      type Props = { tags: Record<string, { variant: 'on' | 'off' }> }
      export function TagList(props: Props) {
        const entries = Object.entries(props.tags).filter(([, t]) => t.variant === 'on')
        return (
          <ul>
            {entries.map(([id, t]) => (
              <Tag key={id} id={id} variant={t.variant} />
            ))}
          </ul>
        )
      }
    `
    await compileAndEvalClientJs(listSource, 'TagList.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('TagList', {
      tags: { a: { variant: 'on' }, b: { variant: 'on' }, c: { variant: 'off' } },
    }) as Element
    document.body.appendChild(el)

    // Two `on` entries become two rendered children; the `off` entry is
    // filtered out before the loop.
    const tags = el.querySelectorAll('span.tag-on')
    expect(tags.length).toBe(2)
    expect(tags[0].textContent).toBe('a')
    expect(tags[1].textContent).toBe('b')
    // Per #1249 child bf-s leads with the component name + id (no `~`
    // prefix). Hydrate skips the element via bf-h presence on a re-walk,
    // so parent-driven init owns this scope.
    expect(tags[0].getAttribute('bf-s') || '').toMatch(/^Tag_/)
  })

  test('#1268 — composite element body with nested component materialises', async () => {
    // Loop body is `<li><Cell /></li>` — a plain element wrapping a
    // nested child component. The materialize template inlines
    // `${renderChild('Cell', ...)}` inside the `<li>`; the resulting
    // `<li>` lands in the container with the `Cell` already rendered as
    // a real child element (not a `data-bf-ph` placeholder).
    const cellSource = `
      'use client'
      export function Cell(props: { label: string }) {
        return <span>{props.label}</span>
      }
    `
    await compileAndEvalClientJs(cellSource, 'Cell.tsx')
    const tableSource = `
      'use client'
      type Props = { rows: Record<string, { label: string }> }
      export function Table(props: Props) {
        const entries = Object.entries(props.rows)
        return (
          <ul>
            {entries.map(([id, row]) => (
              <li key={id}>
                <Cell label={row.label} />
              </li>
            ))}
          </ul>
        )
      }
    `
    await compileAndEvalClientJs(tableSource, 'Table.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('Table', {
      rows: { a: { label: 'A' }, b: { label: 'B' } },
    }) as Element
    document.body.appendChild(el)

    const items = el.querySelectorAll('li')
    expect(items.length).toBe(2)
    expect(items[0].getAttribute('data-key')).toBe('a')
    expect(items[1].getAttribute('data-key')).toBe('b')
    // No placeholder slipped through into the rendered output.
    expect(el.querySelectorAll('[data-bf-ph]').length).toBe(0)
    // Each `<li>` contains a `Cell` rendered with the prop label.
    expect(items[0].textContent).toContain('A')
    expect(items[1].textContent).toContain('B')
  })

  test('empty prop produces empty container (no spurious children)', async () => {
    const source = `
      'use client'
      type Props = { reactions: Record<string, string[]> }
      export function ReactionBar2(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div data-reaction-bar="true">
            {entries.map(([emoji, users]) => (
              <button key={emoji} type="button">
                <span>{emoji}</span>
                <span>{String(users.length)}</span>
              </button>
            ))}
          </div>
        )
      }
    `
    await compileAndEvalClientJs(source, 'ReactionBar2.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('ReactionBar2', { reactions: {} }) as Element
    document.body.appendChild(el)

    expect(el.querySelectorAll('button').length).toBe(0)
  })
})
