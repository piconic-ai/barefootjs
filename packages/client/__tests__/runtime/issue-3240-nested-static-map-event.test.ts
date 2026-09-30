/**
 * End-to-end runtime test for #3240: a nested `.map()` over STATIC arrays
 * (module-level `const`s, so the outer loop hydrates via `forEach` instead
 * of `mapArray`) whose INNER row has an event handler that closes over the
 * inner loop's own param. The delegated listener lives on the outer loop's
 * container and, pre-fix, resolved only the outer item by index — it never
 * declared the inner param, so the handler threw
 * `ReferenceError: <innerParam> is not defined` on every click.
 *
 * Mirrors `event-delegation-index-param-e2e.test.ts` (#2189)'s mount/click
 * harness — mounts the real compiled output in a DOM and dispatches a real
 * click, so this exercises `emitStaticIndexLookup`'s emitted dispatcher
 * exactly as `hydrate()` runs it in production, not just its string shape.
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

async function mount(source: string, filename: string, name: string): Promise<HTMLElement> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const dir = mkdtempSync(join(tmpdir(), 'bf-3240-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

describe('#3240 — nested static .map(): inner-row event handler resolves the inner param', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('clicking an inner-loop button runs the handler with the correct inner AND outer param (no ReferenceError)', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const GROUPS = ['a', 'b']
      const CHOICES = ['1', '2']
      export function App() {
        const [picked, setPicked] = createSignal('')
        return (
          <div>
            {GROUPS.map(group => (
              <div key={group}>
                {CHOICES.map(choice => (
                  <button
                    key={choice}
                    data-choice={\`\${group}\${choice}\`}
                    aria-pressed={picked() === \`\${group}\${choice}\` ? 'true' : 'false'}
                    onClick={() => setPicked(\`\${group}\${choice}\`)}
                  >
                    {group}{choice}
                  </button>
                ))}
              </div>
            ))}
            <pre id="state">{picked()}</pre>
          </div>
        )
      }
    `
    const el = await mount(source, 'App.tsx', 'App')
    const state = el.querySelector('#state')!
    expect(state.textContent).toBe('')

    const buttons = Array.from(el.querySelectorAll('button'))
    expect(buttons).toHaveLength(4)
    const b2 = buttons.find((b) => b.getAttribute('data-choice') === 'b2')!
    expect(b2).toBeDefined()

    // Pre-fix this threw `ReferenceError: choice is not defined` and never
    // reached `setPicked` — `state` stayed empty and `aria-pressed` never
    // flipped.
    b2.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(state.textContent).toBe('b2')
    expect(b2.getAttribute('aria-pressed')).toBe('true')

    const a1 = buttons.find((b) => b.getAttribute('data-choice') === 'a1')!
    a1.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(state.textContent).toBe('a1')
    expect(a1.getAttribute('aria-pressed')).toBe('true')
    expect(b2.getAttribute('aria-pressed')).toBe('false')
  })

  test('a static sibling before the inner .map() does not shift which item a click resolves to', async () => {
    // Follow-up to the fix above: `emitNestedIndexParams` recovers a nested
    // level's item by DOM position within its container. A static element
    // (`<span>hdr</span>`) preceding `CHOICES.map()` inside the row shifts
    // every button one slot later in `__ic1.children` — pre-fix, the missing
    // offset subtraction (`NestedLoop.offset` went unset on the
    // delegated-event chain) silently resolved the FIRST button to
    // `CHOICES[1]` instead of `CHOICES[0]`: no error, just the wrong item —
    // a silent divergence, not the loud `ReferenceError` the first test
    // guards against.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const GROUPS = ['a', 'b']
      const CHOICES = ['1', '2']
      export function App() {
        const [picked, setPicked] = createSignal('')
        return (
          <div>
            {GROUPS.map(group => (
              <div key={group}>
                <span>hdr</span>
                {CHOICES.map(choice => (
                  <button
                    key={choice}
                    data-choice={\`\${group}\${choice}\`}
                    onClick={() => setPicked(\`\${group}\${choice}\`)}
                  >
                    {group}{choice}
                  </button>
                ))}
              </div>
            ))}
            <pre id="state">{picked()}</pre>
          </div>
        )
      }
    `
    const el = await mount(source, 'App.tsx', 'App')
    const state = el.querySelector('#state')!

    const buttons = Array.from(el.querySelectorAll('button'))
    expect(buttons).toHaveLength(4)
    const b1 = buttons.find((b) => b.getAttribute('data-choice') === 'b1')!
    expect(b1).toBeDefined()

    b1.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(state.textContent).toBe('b1')
  })

  test('clicking the inner item whose value is 0 still runs the handler', async () => {
    // Pullfrog follow-up: the nested guard used to check the resolved
    // ITEM's truthiness (`if (choice) {`), not whether the lookup resolved
    // at all — so a numeric array containing `0` silently swallowed a click
    // on that item (`if (0)` is false). Guarding on the resolved index
    // (`__iidx1 >= 0`) instead means this now runs the handler.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const GROUPS = ['a', 'b']
      const NUMS = [0, 1, 2]
      export function App() {
        const [picked, setPicked] = createSignal(-1)
        return (
          <div>
            {GROUPS.map(group => (
              <div key={group}>
                {NUMS.map(n => (
                  <button key={n} data-btn={\`\${group}\${n}\`} onClick={() => setPicked(n)}>{group}{n}</button>
                ))}
              </div>
            ))}
            <pre id="state">{picked()}</pre>
          </div>
        )
      }
    `
    const el = await mount(source, 'App.tsx', 'App')
    const state = el.querySelector('#state')!
    expect(state.textContent).toBe('-1')

    const buttons = Array.from(el.querySelectorAll('button'))
    const b0 = buttons.find((b) => b.getAttribute('data-btn') === 'a0')!
    expect(b0).toBeDefined()

    b0.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(state.textContent).toBe('0')
  })
})
