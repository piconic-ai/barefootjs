/**
 * Diagnostic tests for BF063 (`REF_ATTR_ABSENT_AT_SSR`).
 *
 * A `ref` callback never runs at SSR, so an attribute it writes
 * unconditionally on mount — and that the element's own JSX never renders —
 * is always missing from the server HTML and always added by hydration: a
 * visible snap. The refusal is narrowed to that decidable shape; every
 * exemption below is a shape where the divergence is NOT certain (or the
 * author opted out), and must keep compiling clean.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function bf063(body: string, jsx: string, extraImports = '') {
  const source = `
    'use client'
    import { createSignal, createEffect, onMount } from '@barefootjs/client'
    ${extraImports}
    export function Comp(props: { delay?: number; rest?: Record<string, string> }) {
      const [open, setOpen] = createSignal(false)
      ${body}
      return ${jsx}
    }
  `
  const result = compileJSX(source, 'Comp.tsx', { adapter })
  return result.errors.filter(e => e.code === ErrorCodes.REF_ATTR_ABSENT_AT_SSR)
}

describe('BF063 — ref callback writes an attribute the JSX never renders', () => {
  describe('fires', () => {
    test('setAttribute at the top level of a named ref callback', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => { el.setAttribute('data-mounted', '1') }`,
        `<div ref={handleMount}>x</div>`,
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('error')
      expect(errors[0].message).toContain("'data-mounted'")
    })

    test('dataset write inside a directly nested createEffect (camelCase key → data-kebab)', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => {
          createEffect(() => { el.dataset.nmOpenDelay = String(props.delay ?? 200) })
        }`,
        `<nav ref={handleMount}>x</nav>`,
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("'data-nm-open-delay'")
    })

    test('inline arrow ref, concise body', () => {
      const errors = bf063('', `<div ref={(el) => el.setAttribute('aria-busy', 'true')}>x</div>`)
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("'aria-busy'")
    })

    test('function declaration ref, onMount body, element-access dataset key', () => {
      const errors = bf063(
        `function handleMount(el: HTMLElement) {
          onMount(() => { el.dataset['ready'] = 'yes' })
        }`,
        `<div ref={handleMount}>x</div>`,
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("'data-ready'")
    })

    test('self-closing element', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLInputElement) => { el.setAttribute('data-kind', 'x') }`,
        `<input ref={handleMount} />`,
      )
      expect(errors).toHaveLength(1)
    })

    test('reports each attribute once, only the ones the JSX does not render', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => {
          el.setAttribute('data-a', '1')
          createEffect(() => {
            el.setAttribute('data-a', open() ? '1' : '0')
            el.setAttribute('data-b', '1')
            el.setAttribute('data-state', open() ? 'open' : 'closed')
          })
        }`,
        `<div data-state="closed" ref={handleMount}>x</div>`,
      )
      expect(errors.map(e => e.message.match(/'([^']+)'/)![1])).toEqual(['data-a', 'data-b'])
    })

    test('message and suggestion name the attribute and both escapes', () => {
      const [error] = bf063(
        `const handleMount = (el: HTMLElement) => { el.setAttribute('data-mounted', '1') }`,
        `<div ref={handleMount}>x</div>`,
      )
      expect(error.message).toContain('never runs at SSR')
      expect(error.suggestion?.message).toContain('data-mounted={…}')
      expect(error.suggestion?.message).toContain('/* @client */')
      expect(error.suggestion?.escape).toEqual([{ kind: 'rewrite' }, { kind: 'client-directive' }])
      // Located at the write, not at the element.
      expect(error.loc.start.line).toBe(7)
    })
  })

  describe('exempt', () => {
    test('attribute already rendered by the JSX (literal later overwritten by an effect)', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            createEffect(() => { el.setAttribute('aria-expanded', String(open())) })
          }`,
          `<button aria-expanded="false" ref={handleMount}>x</button>`,
        ),
      ).toEqual([])
    })

    test('attribute rendered from props (the rewrite escape)', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            createEffect(() => { el.dataset.nmOpenDelay = String(props.delay ?? 200) })
          }`,
          `<nav data-nm-open-delay={String(props.delay ?? 200)} ref={handleMount}>x</nav>`,
        ),
      ).toEqual([])
    })

    test('conditional write', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            if (props.delay) el.setAttribute('data-delayed', '1')
            createEffect(() => { if (open()) el.setAttribute('data-open', '') })
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('write inside an event listener or timer closure', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            el.addEventListener('click', () => { el.setAttribute('data-clicked', '1') })
            setTimeout(() => { el.dataset.late = '1' }, 10)
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('write to another node', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            const root = el.closest('nav') as HTMLElement
            root.dataset.owner = '1'
            el.querySelector('span')?.setAttribute('data-inner', '1')
          }`,
          `<div ref={handleMount}><span>x</span></div>`,
        ),
      ).toEqual([])
    })

    test('element with a spread', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => { el.setAttribute('data-mounted', '1') }`,
          `<div {...props.rest} ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('leading /* @client */ on the ref expression', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => { el.setAttribute('data-mounted', '1') }`,
          `<div ref={/* @client */ handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('a createEffect nested deeper than one level, or one shadowing the param', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            createEffect(() => { createEffect(() => { el.setAttribute('data-deep', '1') }) })
            createEffect((el: HTMLElement) => { el.setAttribute('data-shadow', '1') })
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('a dynamic attribute name, or an opaque (non-local) ref callback', () => {
      expect(
        bf063(
          `const name = 'data-x'
          const handleMount = (el: HTMLElement) => { el.setAttribute(name, '1') }`,
          `<div ref={handleMount}><span ref={props.rest as never}>x</span></div>`,
        ),
      ).toEqual([])
    })
  })
})
