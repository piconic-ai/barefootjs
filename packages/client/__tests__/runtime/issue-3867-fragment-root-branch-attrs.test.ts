/**
 * #3867: a conditional branch that is a direct child of a Fragment root
 * lands as a top-level sibling of the component's scope proxy (its first
 * element). Reactive attributes inside the branch are looked up with
 * `qsa(__branchScope, ...)` from that proxy, and a child component the
 * branch renders is stamped with the host id `insert()` resolves from it.
 * Both must answer for the whole comment scope, not only for the proxy's
 * own subtree.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { qsa } from '../../src/runtime/query'
import { commentScopeRegistry } from '../../src/runtime/scope'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const runtimePath = join(__dirname, '../../src/runtime/index.ts')

async function load(source: string, name: string): Promise<void> {
  const result = compileJSX(source, `${name}.tsx`, { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const js = result.files.find(f => f.type === 'clientJs')?.content
  if (!js) throw new Error('No client JS')
  const file = join(mkdtempSync(join(tmpdir(), 'bf-3867-')), `${name}.mjs`)
  writeFileSync(file, js.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`))
  await import(file)
}

async function mount(name: string): Promise<HTMLElement> {
  const { render } = await import('../../src/runtime/render')
  const container = document.createElement('div')
  document.body.appendChild(container)
  render(container, name, {})
  return container
}

describe('#3867 — Fragment-root conditional branch bindings', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('reactive disabled / hidden / data-x inside a branch follow the signal', async () => {
    await load(`'use client'
import { createSignal } from '@barefootjs/client'
export function Issue3867Attrs() {
  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  return <>
    <button data-toggle onClick={() => setBusy(!busy())}>{busy() ? 'busy' : 'idle'}</button>
    {shown() ? <button data-action data-x={busy() ? 'yes' : 'no'} disabled={busy()} hidden={busy()}>action</button> : null}
    <button data-enter onClick={() => setLate(!late())}>enter</button>
    {late() ? <span data-late data-x={busy() ? 'yes' : 'no'} hidden={busy()}>late</span> : null}
  </>
}`, 'Issue3867Attrs')
    const container = await mount('Issue3867Attrs')
    const toggle = container.querySelector('[data-toggle]') as HTMLButtonElement
    const action = () => container.querySelector('[data-action]') as HTMLButtonElement

    toggle.click()
    expect(toggle.textContent).toBe('busy')
    expect(action().disabled).toBe(true)
    expect(action().hidden).toBe(true)
    expect(action().getAttribute('data-x')).toBe('yes')

    toggle.click()
    expect(action().disabled).toBe(false)
    expect(action().hidden).toBe(false)
    expect(action().getAttribute('data-x')).toBe('no')

    // A branch absent at first render and entered later.
    ;(container.querySelector('[data-enter]') as HTMLButtonElement).click()
    const late = container.querySelector('[data-late]') as HTMLElement
    expect(late.getAttribute('data-x')).toBe('no')
    toggle.click()
    expect(late.getAttribute('data-x')).toBe('yes')
    expect(late.hidden).toBe(true)
  })

  test('render() keeps the comment range of a Fragment root that mounts a single element', async () => {
    // The branch is absent at mount, so the template has one element plus
    // the conditional's markers. Dropping the markers made the branch
    // impossible to enter.
    await load(`'use client'
import { createSignal } from '@barefootjs/client'
export function Issue3867Single() {
  const [shown, setShown] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  return <>
    <button data-toggle onClick={() => { if (!shown()) setShown(true); else setBusy(!busy()) }}>{busy() ? 'busy' : 'idle'}</button>
    {shown() ? <button data-action disabled={busy()} hidden={busy()}>action</button> : null}
  </>
}`, 'Issue3867Single')
    const container = await mount('Issue3867Single')
    expect(container.firstChild?.nodeValue).toMatch(/^bf-scope:Issue3867Single_/)
    const toggle = container.querySelector('[data-toggle]') as HTMLButtonElement
    expect(toggle.hasAttribute('bf-s')).toBe(false)

    toggle.click()
    const action = container.querySelector('[data-action]') as HTMLButtonElement
    expect(action).not.toBeNull()
    expect(action.disabled).toBe(false)
    toggle.click()
    expect(toggle.textContent).toBe('busy')
    expect(action.disabled).toBe(true)
    expect(action.hidden).toBe(true)
  })

  test('a child component in a branch is hosted by the fragment scope and follows boolean props', async () => {
    await load(`'use client'
import { createSignal } from '@barefootjs/client'
function Issue3867Child({ disabled, hidden }: { disabled: boolean; hidden: boolean }) {
  return <button data-child disabled={disabled} hidden={hidden}>child</button>
}
export function Issue3867Parent() {
  const [shown] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  return <>
    <button data-toggle onClick={() => setBusy(!busy())}>{busy() ? 'busy' : 'idle'}</button>
    {shown() ? <Issue3867Child disabled={busy()} hidden={busy()} /> : null}
  </>
}`, 'Issue3867Parent')
    const container = await mount('Issue3867Parent')
    const child = container.querySelector('[data-child]') as HTMLButtonElement
    const scopeComment = container.firstChild as Comment
    const scopeId = scopeComment.nodeValue!.replace(/^bf-scope:/, '')
    expect(child.getAttribute('bf-h')).toBe(scopeId)

    ;(container.querySelector('[data-toggle]') as HTMLButtonElement).click()
    expect(child.disabled).toBe(true)
    expect(child.hidden).toBe(true)
  })
})

describe('#3867 — qsa on a comment-scope proxy', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function proxyOf(html: string): Element {
    document.body.innerHTML = html
    const comment = document.body.firstChild as Comment
    const proxy = document.body.firstElementChild!
    commentScopeRegistry.set(proxy, { commentNode: comment, scopeId: 'P_1' })
    return proxy
  }

  test('finds a slot in a top-level sibling of the proxy', () => {
    const proxy = proxyOf(
      '<!--bf-scope:P_1--><button bf="s1"></button><button id="hit" bf="s3"></button><!--bf-/scope:P_1-->',
    )
    expect(qsa(proxy, '[bf="s3"]')?.id).toBe('hit')
  })

  test("prefers the proxy's own subtree", () => {
    const proxy = proxyOf(
      '<!--bf-scope:P_1--><div bf="s1"><i id="own" bf="s3"></i></div><i bf="s3"></i><!--bf-/scope:P_1-->',
    )
    expect(qsa(proxy, '[bf="s3"]')?.id).toBe('own')
  })

  test('does not leave the range or enter a child scope', () => {
    const proxy = proxyOf(
      '<!--bf-scope:P_1--><button bf="s1"></button>' +
        '<span bf-s="P_1_s2"><i bf="s3"></i></span>' +
        '<!--bf-scope:Q_1--><i bf="s3"></i><!--bf-/scope:Q_1-->' +
        '<!--bf-/scope:P_1--><i bf="s3"></i>',
    )
    expect(qsa(proxy, '[bf="s3"]')).toBeNull()
  })

  test("searches a loop row's range from insert()'s detached proxy", () => {
    document.body.innerHTML =
      '<div bf-s="P_1"><!--bf-loop:l0--><!--bf-loop-i:1--><em id="row1" bf="s3"></em>' +
      '<!--bf-loop-i:2--><em id="row2" bf="s3"></em><!--bf-/loop:l0--></div>'
    const anchor = [...document.body.firstElementChild!.childNodes].find(
      n => n.nodeType === Node.COMMENT_NODE && n.nodeValue === 'bf-loop-i:2',
    ) as Comment
    const proxy = document.createElement('bf-loop-item')
    commentScopeRegistry.set(proxy, { commentNode: anchor, scopeId: 'P_1' })
    expect(qsa(proxy, '[bf="s3"]')?.id).toBe('row2')
  })

  test("matches a top-level child component's own root", () => {
    const proxy = proxyOf(
      '<!--bf-scope:P_1--><button bf="s1"></button><span id="child" bf-s="P_1_s2" bf-h="P_1" bf-m="s2"></span><!--bf-/scope:P_1-->',
    )
    expect(qsa(proxy, '[bf-h="P_1"][bf-m="s2"]')?.id).toBe('child')
  })
})
