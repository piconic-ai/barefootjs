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
  // resolver. Drop `export` so the file can be loaded as ESM.
  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs.replace(
    /from\s+['"]@barefootjs\/client\/runtime['"]/g,
    `from '${runtimePath}'`,
  )

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
