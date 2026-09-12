/**
 * #2959 — a `'use client'` fragment-root child component mounted as an
 * ordinary nested child inside a PARENT's own fragment-conditional branch
 * (via the plain `t && initChild(name, t, props)` call a compiled
 * `bindEvents` makes — see `control-flow/stringify/insert.ts`'s
 * `emitArmBody`, NOT `upsertChild`/`materializeComponent`) could have its
 * OWN internal conditional permanently stop updating after the very first
 * render, silently.
 *
 * Root cause (`updateFragmentConditional`, `insert.ts`): the branch's own
 * template embeds a redundant `<!--bf-cond-start:id-->...<!--bf-cond-end:id-->`
 * wrapper around its content (`addCondAttrToTemplate`), which must be
 * stripped before splicing the content between the REAL, persistent DOM
 * markers already bracketing the insertion point. The old filter dropped
 * ANY top-level comment whose value started with `bf-cond-`, not just
 * that specific pair — so when a fragment-root child with no wrapper
 * element of its own (`StatusBarCopy` below) sits inside the branch, ITS
 * OWN `bf-cond-start:<childId>`/`bf-cond-end:<childId>` markers (top-level
 * siblings of its `<footer>`, since it has no wrapper) were erased from
 * the DOM outright. With no markers left to find, the child's own
 * `insert()` call could never locate its start comment again — a
 * permanent, silent no-op on every future toggle.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map(e => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
}

async function loadComponent(source: string, filename: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-2959-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}_${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, clientJsFor(source, filename))
  await import(file)
}

const WELCOME_SRC = `'use client'
export function Welcome2959() {
  return <div id="welcome-2959">Welcome</div>
}
`

// Fragment-root: its render has no single wrapping element — `<footer>`
// sits alongside its own conditional's markers as top-level siblings,
// exactly the shape #2959 needs.
const STATUS_BAR_SRC = `'use client'
export interface StatusBarProps2959 {
  errorMessage: string | null
  statusMessage: string
}
export function StatusBarCopy2959(props: StatusBarProps2959) {
  return (
    <>
      {props.errorMessage ? (
        <div id="banner-copy-2959">{props.errorMessage}</div>
      ) : null}
      <footer id="footer-copy-2959">{props.statusMessage}</footer>
    </>
  )
}
`

const REPRO_SRC = `'use client'
import { createSignal } from '@barefootjs/client'
import { StatusBarCopy2959 } from './StatusBarCopy2959'
import { Welcome2959 } from './Welcome2959'

export function Repro2959() {
  const [deckOpen, setDeckOpen] = createSignal(false)
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)
  const [statusMessage] = createSignal('Opened deck.md')

  return (
    <div>
      <button id="open-deck-2959" onClick={() => setDeckOpen(true)}>open deck</button>
      <button id="trigger-2959" onClick={() => setErrorMessage('boom')}>trigger error</button>
      {deckOpen() === false ? (
        <Welcome2959 />
      ) : (
        <>
          <div id="before-2959">before</div>
          <StatusBarCopy2959 errorMessage={errorMessage()} statusMessage={statusMessage()} />
          <div id="after-2959">after</div>
        </>
      )}
    </div>
  )
}
`

describe('#2959 — fragment-root child mounted plainly inside a parent branch keeps its own conditional live', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('the child\'s own conditional still updates after the parent branch swap that mounted it', async () => {
    await loadComponent(WELCOME_SRC, 'Welcome2959.tsx')
    await loadComponent(STATUS_BAR_SRC, 'StatusBarCopy2959.tsx')
    await loadComponent(REPRO_SRC, 'Repro2959.tsx')

    const { createComponent } = await import(runtimePath)
    const el = createComponent('Repro2959', {}) as HTMLElement
    document.body.appendChild(el)

    expect(el.querySelector('#welcome-2959')).not.toBeNull()

    // Swap the parent's OWN conditional into the branch that mounts
    // StatusBarCopy2959 as a plain nested child.
    ;(el.querySelector('#open-deck-2959') as HTMLElement).click()

    expect(el.querySelector('#welcome-2959')).toBeNull()
    expect(el.querySelector('#before-2959')).not.toBeNull()
    expect(el.querySelector('#footer-copy-2959')?.textContent).toBe('Opened deck.md')
    // Null branch: the child's own conditional has not fired yet.
    expect(el.querySelector('#banner-copy-2959')).toBeNull()

    // Trigger the CHILD's own internal conditional. Before the fix, this
    // permanently no-oped because the child's own bf-cond-start/end
    // markers were erased from the DOM by the parent's branch-swap splice.
    ;(el.querySelector('#trigger-2959') as HTMLElement).click()

    expect(el.querySelector('#banner-copy-2959')?.textContent).toBe('boom')
    // Every other sibling in the parent's branch is still intact.
    expect(el.querySelector('#before-2959')).not.toBeNull()
    expect(el.querySelector('#after-2959')).not.toBeNull()
  })
})
