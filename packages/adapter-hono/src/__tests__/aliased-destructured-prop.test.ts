/**
 * Aliased (renaming) destructured props (#2460).
 *
 * The Hono adapter used to build its SSR props destructure keyed by
 * `ParamInfo.name` (the LOCAL binding) instead of `sourceName ?? name`
 * (the CALLER-facing key — see `ParamInfo.sourceName`'s docstring in
 * `packages/jsx/src/types.ts`). For a renaming destructure
 * (`{ n: count }`) the emitted SSR function read a `count` property the
 * caller never passed (the caller passes `n`), so the local binding was
 * always `undefined`.
 *
 * These tests render through Hono end-to-end (`renderHonoComponent`) and
 * assert the actual rendered VALUE, not just the emitted destructure
 * text — a byte-identical destructure with the wrong runtime binding
 * would still pass a text-only assertion.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { renderHonoComponent } from '../test-render'
import { HonoAdapter } from '../adapter/hono-adapter'

describe('aliased destructured props (#2460)', () => {
  test('{ text, n: count } — aliased, no default: the caller-supplied `n` reaches the `count` binding', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        export function Badge({ text, n: count }: { text: string; n: number }) {
          return <span>{text}:{count}</span>
        }
      `,
      props: { text: 'hello', n: 7 },
    })

    expect(html).toContain('hello')
    expect(html).toContain(':<!--bf:s1-->7<!--/-->')
  })

  test('{ text, n: count = 7 } — aliased with a destructuring default, caller omits `n`', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        export function Badge({ text, n: count = 7 }: { text: string; n?: number }) {
          return <span>{text}:{count}</span>
        }
      `,
      props: { text: 'hello' },
    })

    expect(html).toContain(':<!--bf:s1-->7<!--/-->')
  })

  test('{ text, n: count = 7 } — aliased with a default, caller-supplied `n` overrides it', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        export function Badge({ text, n: count = 7 }: { text: string; n?: number }) {
          return <span>{text}:{count}</span>
        }
      `,
      props: { text: 'hello', n: 42 },
    })

    expect(html).toContain(':<!--bf:s1-->42<!--/-->')
  })

  test('{ text, n } — un-aliased: emitted destructure text is byte-identical to the pre-fix shorthand', () => {
    const source = `
      export function Badge({ text, n }: { text: string; n: number }) {
        return <span>{text}:{n}</span>
      }
    `
    const result = compileJSX(source, 'Badge.tsx', { adapter: new HonoAdapter() })
    const errors = result.errors.filter((e) => e.severity === 'error')
    expect(errors).toEqual([])
    const tmpl = result.files.find((f) => f.type === 'markedTemplate')
    expect(tmpl).toBeDefined()
    // Plain shorthand destructure — no `sourceKey: localName` rename text
    // for an un-aliased prop.
    expect(tmpl!.content).toContain('export function Badge({ text, n, __instanceId,')
  })

  test('a renamed `class` prop emits the rename `class: className`, not a bare `className`', () => {
    // `class` is a reserved word and can never be an un-aliased binding
    // identifier (`{ class }` is a syntax error), so the only way a
    // `class`-named caller prop reaches `propsParams` through a
    // destructured component is via an explicit alias.
    const source = `
      export function Chip({ class: className }: { class: string }) {
        return <span class={className}>x</span>
      }
    `
    const result = compileJSX(source, 'Chip.tsx', { adapter: new HonoAdapter() })
    const errors = result.errors.filter((e) => e.severity === 'error')
    expect(errors).toEqual([])
    const tmpl = result.files.find((f) => f.type === 'markedTemplate')
    expect(tmpl).toBeDefined()
    expect(tmpl!.content).toContain('class: className')
  })

  test('aliased prop reaches client-side hydration serialization with the correct value', async () => {
    // The client init function reads `_p.<callerKey>` (props-extraction
    // phase), so the SSR-serialized `bf-p` blob must carry the correct
    // value under the CALLER-facing key (`n`) — `_p` is uniformly keyed
    // by `sourceName ?? name` across every producer/consumer (#2524 CSR
    // half), not the local binding the destructure renames it to.
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        'use client'
        import { createEffect } from '@barefootjs/client'
        export function Badge({ text, n: count }: { text: string; n: number }) {
          createEffect(() => {
            console.log(count)
          })
          return <span>{text}:{count}</span>
        }
      `,
      props: { text: 'hello', n: 7 },
    })

    // The rendered value is correct...
    expect(html).toContain(':<!--bf:s1-->7<!--/-->')
    // ...and the serialized hydration payload carries it under the
    // CALLER-facing key, which is what the generated client JS's
    // `const count = _p.n` extraction reads.
    expect(html).toMatch(/bf-p="[^"]*n[^"]*7/)
  })
})
