/**
 * Runtime regression test for #2724.
 *
 * A bare `const x = y` alias hop between a prop and a keyed `.map()` of a
 * stateful child component made the loop's array look, to
 * `isArrayExprDirectPropRef` (jsx-to-ir.ts), like a local constant with no
 * prop/signal origin — so the loop compiled to the static `qsaChildScopes`
 * init path instead of `mapArray`. That static path's `renderChild()`
 * calls carry no `bf-h`/`bf-m` scope-relationship attributes on a pure CSR
 * mount (no existing SSR markup to hydrate against), so the static init's
 * `qsaChildScopes` selector never matches on a CSR mount — the row's child
 * component never gets `initChild`ed, so its own `createSignal` / event
 * listener never wire up and clicking it does nothing.
 *
 * Mirrors `static-loop-csr-materialize.test.ts`'s `compileAndEvalClientJs`
 * harness: compile real component source, evaluate the emitted client JS
 * in happy-dom, mount via `createComponent` (no SSR — the CSR-mount leg),
 * and click.
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

  const dir = mkdtempSync(join(tmpdir(), 'bf-2724-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
}

const TOGGLE_ITEM_SOURCE = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function ToggleItem(props: { label: string; defaultOn?: boolean }) {
    const [on, setOn] = createSignal(props.defaultOn ?? false)
    return <button onClick={() => setOn(!on())}>{props.label}: {on() ? 'ON' : 'OFF'}</button>
  }
`

async function mountAndToggleFirstRow(listSource: string, filename: string): Promise<string> {
  await compileAndEvalClientJs(TOGGLE_ITEM_SOURCE, 'ToggleItem.tsx')
  await compileAndEvalClientJs(listSource, filename)

  const { createComponent } = await import('../../src/runtime')
  const el = createComponent('List', {
    items: [{ label: 'Setting 1', defaultOn: false }],
  }) as Element
  document.body.appendChild(el)

  const button = el.querySelector('button')!
  button.click()
  await new Promise(r => setTimeout(r, 0))
  return button.textContent ?? ''
}

describe('#2724 — CSR-mounted keyed loop wires up a stateful child through a prop alias', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('one-hop `const items__alias = items` alias still wires up click handlers', async () => {
    const text = await mountAndToggleFirstRow(`
      'use client'
      type Props = { items: Array<{ label: string; defaultOn?: boolean }> }
      export function List({ items }: Props) {
        const items__alias = items
        return <div>{items__alias.map((item) => <ToggleItem key={item.label} label={item.label} defaultOn={item.defaultOn} />)}</div>
      }
    `, 'AliasHopList.tsx')
    expect(text).toContain('ON')
  })

  test('a local const derived from a whole-props member access still wires up click handlers', async () => {
    const text = await mountAndToggleFirstRow(`
      'use client'
      type Props = { items: Array<{ label: string; defaultOn?: boolean }> }
      export function List(props: Props) {
        const arr = props.items
        return <div>{arr.map((item) => <ToggleItem key={item.label} label={item.label} defaultOn={item.defaultOn} />)}</div>
      }
    `, 'MemberAliasList.tsx')
    expect(text).toContain('ON')
  })

  test('review finding: an alias of the WHOLE props object (property access on it) still wires up click handlers', async () => {
    // `const p = props; p.items.map(...)` — the exact shape
    // `packages/adapter-tests/mutation/mutations.ts`'s `alias-props`
    // mutation produces for a `(props)`-arg component (unlike the
    // destructured-prop case above). Found missing from the initial fix
    // during design review: the property-access branch only checked
    // `obj.text === propsObjName` directly, never resolving an ALIAS of
    // the props object itself.
    const text = await mountAndToggleFirstRow(`
      'use client'
      type Props = { items: Array<{ label: string; defaultOn?: boolean }> }
      export function List(props: Props) {
        const p = props
        return <div>{p.items.map((item) => <ToggleItem key={item.label} label={item.label} defaultOn={item.defaultOn} />)}</div>
      }
    `, 'ObjectAliasList.tsx')
    expect(text).toContain('ON')
  })

  test('baseline: a direct (un-aliased) prop reference wires up click handlers', async () => {
    const text = await mountAndToggleFirstRow(`
      'use client'
      type Props = { items: Array<{ label: string; defaultOn?: boolean }> }
      export function List({ items }: Props) {
        return <div>{items.map((item) => <ToggleItem key={item.label} label={item.label} defaultOn={item.defaultOn} />)}</div>
      }
    `, 'DirectPropList.tsx')
    expect(text).toContain('ON')
  })
})
