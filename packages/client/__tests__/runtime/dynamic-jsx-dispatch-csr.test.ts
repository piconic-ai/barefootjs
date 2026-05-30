/**
 * Runtime regression test for #1663.
 *
 * A `Record<K, () => JSX>` lookup map dispatched in child position
 * (`<div>{themeLogo(props.id)}</div>` where `themeLogo` returns
 * `THEME_LOGOS[id]()`) must render the selected component on the client.
 *
 * Two failures are exercised end-to-end:
 *   1. the arrow values are hoisted into synthesized components, so the
 *      client bundle has no raw JSX and the lookup map survives; and
 *   2. the child slot evaluates to a live element, which `__bfText` splices
 *      in by identity rather than stringifying to `"[object HTMLElement]"`.
 *
 * Compile `BrandLogo` + `Header`, register their `template:`/`init:` via the
 * real runtime, mount `Header` via `createComponent`, and assert the logo
 * element is present.
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

  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-1663-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
}

describe('#1663 — dynamic JSX-returning call renders on the client', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('object-literal arrow lookup map renders the selected component', async () => {
    const brandLogo = `
      'use client'
      export function BrandLogo(props: { name: string }) {
        return <span class="logo">{props.name}</span>
      }
    `
    await compileAndEvalClientJs(brandLogo, 'BrandLogo.tsx')

    const header = `
      'use client'
      import { BrandLogo } from './brand-logo'
      const THEME_LOGOS: Record<string, () => unknown> = {
        piconic: () => <BrandLogo name="piconic" />,
        other: () => <BrandLogo name="other" />,
      }
      function themeLogo(id: string) { return THEME_LOGOS[id]() }
      export function Header(props: { id: string }) {
        return <div class="hdr">{themeLogo(props.id)}</div>
      }
    `
    await compileAndEvalClientJs(header, 'Header.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('Header', { id: 'piconic' }) as Element
    document.body.appendChild(el)

    // The selected logo is rendered into the slot...
    const logo = el.querySelector('.logo')
    expect(logo).not.toBeNull()
    expect(logo!.textContent).toBe('piconic')
    // ...by identity, not stringified.
    expect(el.textContent).toBe('piconic')
    expect(el.innerHTML).not.toContain('[object')
  })

  test('dispatch inside a conditional renders the node, not "[object …]"', async () => {
    // `{show() && themeLogo(id)}` is rendered by insert()/__bfSlot, but the
    // branch's reactive text effect re-evaluates the expression — it must
    // splice the live node via __bfText rather than stringify it (#1663).
    const brandLogo = `
      'use client'
      export function BrandLogo(props: { name: string }) {
        return <span class="logo">{props.name}</span>
      }
    `
    await compileAndEvalClientJs(brandLogo, 'BrandLogo.tsx')

    const header = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { BrandLogo } from './brand-logo'
      const THEME_LOGOS: Record<string, () => unknown> = {
        piconic: () => <BrandLogo name="piconic" />,
      }
      function themeLogo(id: string) { return THEME_LOGOS[id]() }
      export function Header(props: { id: string }) {
        const [show] = createSignal(true)
        return <div class="hdr">{show() && themeLogo(props.id)}</div>
      }
    `
    await compileAndEvalClientJs(header, 'HeaderCond.tsx')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('Header', { id: 'piconic' }) as Element
    document.body.appendChild(el)

    const logo = el.querySelector('.logo')
    expect(logo).not.toBeNull()
    expect(logo!.textContent).toBe('piconic')
    expect(el.textContent).toBe('piconic')
    expect(el.innerHTML).not.toContain('[object')
    // Exactly one logo in the slot (no stale/duplicate node).
    expect(el.querySelectorAll('.logo').length).toBe(1)
  })
})
