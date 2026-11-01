/**
 * A static const spread that overrides an explicit attribute (#3844 review):
 * `<p title={mark()} {...base}>`. JS evaluates `mark()` once and then lets
 * the spread's `title` win, so the rendered value is the spread's while the
 * call still runs. Rendered through Hono end-to-end, counting the calls on
 * `globalThis` (the fixture module runs in this process).
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { renderHonoComponent } from '../test-render'
import { HonoAdapter } from '../adapter/hono-adapter'

type Counter = { __bfMarkCalls?: number }

describe('an explicit attribute a later static spread overrides', () => {
  beforeEach(() => {
    ;(globalThis as Counter).__bfMarkCalls = 0
  })

  const mark = `
function mark(): string {
  const g = globalThis as { __bfMarkCalls?: number }
  g.__bfMarkCalls = (g.__bfMarkCalls ?? 0) + 1
  return 'marked'
}
const base = { title: 'final' }
`

  test('on an element: the value is still evaluated once, and the spread wins', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `${mark}
export function P() {
  return <p title={mark()} {...base}>x</p>
}
`,
    })
    expect((globalThis as Counter).__bfMarkCalls).toBe(1)
    expect(html).toContain('title="final"')
    expect(html).not.toContain('marked')
  })

  test('on a component call: the value is still evaluated once, and the spread wins', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
import { Tag } from './tag'
${mark}
export function P() {
  return <div><Tag title={mark()} {...base} /></div>
}
`,
      components: {
        './tag.tsx': `
export function Tag(props: { title?: string }) {
  return <b title={props.title}>t</b>
}
`,
      },
    })
    expect((globalThis as Counter).__bfMarkCalls).toBe(1)
    expect(html).toContain('title="final"')
    expect(html).not.toContain('marked')
  })

  test('a member read (which can run a getter) is still evaluated once', async () => {
    // The getter also runs when the props are serialized into `bf-p`, so the
    // count is compared against the same read with no spread at all.
    const props = {
      value: {
        get title() {
          const g = globalThis as Counter
          g.__bfMarkCalls = (g.__bfMarkCalls ?? 0) + 1
          return 'marked'
        },
      },
    }
    const render = (spread: string) =>
      renderHonoComponent({
        adapter: new HonoAdapter(),
        source: `
const base = { title: 'final' }
export function P(props: { value: { title: string } }) {
  return <p title={props.value.title} ${spread}>x</p>
}
`,
        props,
      })
    await render('')
    const withoutSpread = (globalThis as Counter).__bfMarkCalls ?? 0
    ;(globalThis as Counter).__bfMarkCalls = 0
    const html = await render('{...base}')
    expect(withoutSpread).toBeGreaterThan(0)
    expect((globalThis as Counter).__bfMarkCalls).toBe(withoutSpread)
    expect(html).toContain('title="final"')
    expect(html).not.toContain('title="marked"')
  })

  test('an effect-free overridden value is dropped and the spread still expands', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
const base = { title: 'final' }
export function P({ label }: { label: string }) {
  return <p title={label} {...base}>x</p>
}
`,
      props: { label: 'L' },
    })
    expect(html).toContain('title="final"')
    expect(html).not.toContain('title="L"')
  })
})
