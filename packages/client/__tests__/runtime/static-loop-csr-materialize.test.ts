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
    // bf-s carries the child component's own name + random id (no `~`
    // prefix per #1249). Hydrate skips child scopes via bf-h presence.
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

  test('#2833 — a stateful loop-item-root component wires up on a pure CSR mount (template-evaluation path)', async () => {
    // Unlike `Tag`/`Cell` above, `ToggleItem` is STATEFUL (`createSignal` +
    // a click handler) — the earlier materialize tests never exercised the
    // actual bug: a loop item root rendered via `renderChild()` with no
    // `bf-h`/`bf-m` never matched the static init's `qsaChildScopes`
    // selector on a pure CSR mount, so `initChild` never ran and its click
    // handler never wired up (no existing SSR markup means no hydration
    // fallback to save it). This case takes the TEMPLATE-EVALUATION path
    // (the array is a module-level literal, inlined directly into the
    // registration template — `_parentScopeId` is already set from
    // `materializeComponent`'s own template call, so only the missing
    // `bf-h`/`bf-m` stamp was the bug).
    const toggleItemSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function ToggleItem2833(props: { label: string }) {
        const [on, setOn] = createSignal(false)
        return <button onClick={() => setOn(!on())}>{props.label}: {on() ? 'ON' : 'OFF'}</button>
      }
    `
    await compileAndEvalClientJs(toggleItemSource, 'ToggleItem2833.tsx')
    const listSource = `
      'use client'
      const ITEMS = [{ label: 'Setting 1' }, { label: 'Setting 2' }]
      export function ModuleConstList(props: {}) {
        return <div>{ITEMS.map((item) => <ToggleItem2833 key={item.label} label={item.label} />)}</div>
      }
    `
    await compileAndEvalClientJs(listSource, 'ModuleConstList.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('ModuleConstList', {}) as Element
    document.body.appendChild(el)

    const button = el.querySelector('button')!
    // Slot identity: `bf-h` matches the parent's own `bf-s`, `bf-m` is the
    // loop's slot id — the static init selector these two feed.
    expect(button.getAttribute('bf-h')).toBe(el.getAttribute('bf-s'))
    expect(button.getAttribute('bf-m')).toBe('s0')
    // Scope id: a loop item root does NOT derive from the parent slot — no
    // `_sN` suffix (regression guard against the rejected "C 案" fallback
    // shape, fable's design §2.3).
    expect(button.getAttribute('bf-s') || '').toMatch(/^ToggleItem2833_/)
    expect(button.getAttribute('bf-s') || '').not.toMatch(/_s\d+$/)

    button.click()
    await new Promise(r => setTimeout(r, 0))
    expect(button.textContent).toContain('ON')
  })

  test('#2833 — a stateful loop-item-root component wires up on a pure CSR mount (materialize path)', async () => {
    // Same bug, materialize codepath: the array is an init-scope local
    // (`Object.entries(...)`), so the CSR template substitutes `[]` and the
    // per-item HTML comes from the materialize `forEach`'s cloned template
    // instead. That runs during `init`, after `_parentScopeId` has already
    // unwound to null — `withParentScope` re-establishes it for the
    // duration of the row's template evaluation.
    const toggleItemSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function ToggleItem2833b(props: { label: string }) {
        const [on, setOn] = createSignal(false)
        return <button onClick={() => setOn(!on())}>{props.label}: {on() ? 'ON' : 'OFF'}</button>
      }
    `
    await compileAndEvalClientJs(toggleItemSource, 'ToggleItem2833b.tsx')
    const listSource = `
      'use client'
      type Props = { tags: Record<string, boolean> }
      export function MaterializeList(props: Props) {
        const entries = Object.entries(props.tags).filter(([, v]) => v).map(([k]) => k)
        return <div>{entries.map((label) => <ToggleItem2833b key={label} label={label} />)}</div>
      }
    `
    await compileAndEvalClientJs(listSource, 'MaterializeList.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('MaterializeList', { tags: { a: true, b: false, c: true } }) as Element
    document.body.appendChild(el)

    const button = el.querySelector('button')!
    expect(button.getAttribute('bf-h')).toBe(el.getAttribute('bf-s'))
    expect(button.getAttribute('bf-m')).toBe('s0')
    expect(button.getAttribute('bf-s') || '').toMatch(/^ToggleItem2833b_/)
    expect(button.getAttribute('bf-s') || '').not.toMatch(/_s\d+$/)

    button.click()
    await new Promise(r => setTimeout(r, 0))
    expect(button.textContent).toContain('ON')
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
