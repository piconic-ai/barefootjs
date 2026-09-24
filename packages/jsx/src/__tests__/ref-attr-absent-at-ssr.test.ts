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

const DEFAULT_IMPORTS = `import { createSignal, createEffect, onMount } from '@barefootjs/client'`

function bf063(body: string, jsx: string, imports = DEFAULT_IMPORTS) {
  const source = `
    'use client'
    ${imports}
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
      expect(error.loc.start.line).toBe(6)
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

  describe('early exits make every later write conditional', () => {
    test('an if-guarded return in the ref body', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            if (!props.delay) return
            el.setAttribute('data-x', '1')
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('an if-guarded return inside a nested createEffect', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            createEffect(() => {
              if (!open()) return
              el.setAttribute('data-x', '1')
            })
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('a throw, or a try / loop / switch that can return, before the write', () => {
      for (const guard of [
        `if (!props.delay) { throw new Error('no delay') }`,
        `try { if (!props.delay) return } catch {}`,
        `for (const k of Object.keys(props)) { if (k === 'x') return }`,
        `switch (props.delay) { case 0: return }`,
        `return`,
      ]) {
        expect(
          bf063(
            `const handleMount = (el: HTMLElement) => {
              ${guard}
              el.setAttribute('data-x', '1')
            }`,
            `<div ref={handleMount}>x</div>`,
          ),
        ).toEqual([])
      }
    })

    test('an early exit inside a nested mount body ends collection for the rest of the ref body too', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            onMount(() => { if (!open()) throw new Error('closed') })
            el.setAttribute('data-x', '1')
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('writes before the guard, and after a guard that cannot exit, still fire', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => {
          el.setAttribute('data-before', '1')
          if (props.delay) el.dataset.delayed = '1'
          el.setAttribute('data-middle', '1')
          if (!open()) return
          el.setAttribute('data-after', '1')
        }`,
        `<div ref={handleMount}>x</div>`,
      )
      expect(errors.map(e => e.message.match(/'([^']+)'/)![1])).toEqual(['data-before', 'data-middle'])
    })
  })

  describe('a later removal cancels the write', () => {
    test('removeAttribute / delete dataset after the write', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            el.setAttribute('data-a', '1')
            el.dataset.b = '1'
            createEffect(() => {
              el.removeAttribute('data-a')
              delete el.dataset.b
            })
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('a conditional removal makes the write uncertain', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            el.setAttribute('data-a', '1')
            if (!open()) el.removeAttribute('data-a')
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('a removal before the write does not cancel it', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => {
          el.removeAttribute('data-a')
          el.setAttribute('data-a', '1')
        }`,
        `<div ref={handleMount}>x</div>`,
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].loc.start.line).toBe(8)
    })
  })

  describe('client-only subtrees never render at SSR', () => {
    test('/* @client */ && and ternary children', () => {
      for (const child of [
        `{/* @client */ open() && <span ref={handleMount}>a</span>}`,
        `{/* @client */ open() ? <span ref={handleMount}>a</span> : null}`,
        `{/* @client */ [1, 2].map(n => <span key={n} ref={handleMount}>{n}</span>)}`,
      ]) {
        expect(
          bf063(
            `const handleMount = (el: HTMLElement) => { el.setAttribute('data-x', '1') }`,
            `<div>${child}</div>`,
          ),
        ).toEqual([])
      }
    })

    test('the same element in an SSR-rendered branch still fires', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => { el.setAttribute('data-x', '1') }`,
        `<div>{open() && <span ref={handleMount}>a</span>}</div>`,
      )
      expect(errors).toHaveLength(1)
    })
  })

  describe('a local declaration shadowing the element parameter', () => {
    test('const in a nested createEffect body', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => {
            createEffect(() => {
              const el = document.body
              el.setAttribute('data-x', '1')
            })
          }`,
          `<div ref={handleMount}>x</div>`,
        ),
      ).toEqual([])
    })

    test('var / function / destructuring in the ref body', () => {
      for (const decl of [
        `var el = document.body`,
        `function el() { return document.body }`,
        `const { el } = { el: document.body }`,
        `const [el] = [document.body]`,
      ]) {
        expect(
          bf063(
            `const handleMount = (el: HTMLElement) => {
              el.setAttribute('data-x', '1')
              ${decl}
            }`,
            `<div ref={handleMount}>x</div>`,
          ),
        ).toEqual([])
      }
    })

    test('a shadow in a nested body leaves the ref body writes intact', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => {
          createEffect(() => {
            let el = document.body
            el.setAttribute('data-inner', '1')
          })
          el.setAttribute('data-outer', '1')
        }`,
        `<div ref={handleMount}>x</div>`,
      )
      expect(errors.map(e => e.message.match(/'([^']+)'/)![1])).toEqual(['data-outer'])
    })
  })

  describe('named ref resolution', () => {
    test('a handler declared in the component body, used inside a .map() row', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => { el.setAttribute('data-x', '1') }`,
        `<ul>{[1, 2].map(n => <li key={n} ref={handleMount}>{n}</li>)}</ul>`,
      )
      expect(errors).toHaveLength(1)
    })

    test('a row-arrow parameter of the same name shadows the component handler', () => {
      expect(
        bf063(
          `const handleMount = (el: HTMLElement) => { el.setAttribute('data-x', '1') }`,
          `<ul>{[(e: HTMLElement) => e].map(handleMount => <li ref={handleMount}>x</li>)}</ul>`,
        ),
      ).toEqual([])
    })
  })

  describe('a handler shared by several elements', () => {
    test('reports once per write, naming every element that lacks the attribute', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => { el.setAttribute('data-x', '1') }`,
        `<div>
          <span ref={handleMount}>a</span>
          <b data-x="1" ref={handleMount}>b</b>
          <i ref={handleMount}>c</i>
        </div>`,
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('<span> at 8:10')
      expect(errors[0].message).toContain('<i> at 10:10')
      expect(errors[0].message).not.toContain('<b>')
    })

    test('a single element is named in the message', () => {
      const [error] = bf063(
        `const handleMount = (el: HTMLElement) => { el.setAttribute('data-x', '1') }`,
        `<section ref={handleMount}>x</section>`,
      )
      expect(error.message).toContain('<section> at 7:13')
    })
  })

  describe('mount primitives resolve through the import bindings', () => {
    test('an aliased createEffect import is recognized', () => {
      const errors = bf063(
        `const handleMount = (el: HTMLElement) => {
          ce(() => { el.setAttribute('data-x', '1') })
        }`,
        `<div ref={handleMount}>x</div>`,
        `import { createSignal, createEffect as ce } from '@barefootjs/client'`,
      )
      expect(errors).toHaveLength(1)
    })

    test('a user-defined onMount is not', () => {
      expect(
        bf063(
          `const onMount = (fn: () => void) => { setTimeout(fn, 100) }
          const handleMount = (el: HTMLElement) => {
            onMount(() => { el.setAttribute('data-x', '1') })
          }`,
          `<div ref={handleMount}>x</div>`,
          `import { createSignal } from '@barefootjs/client'`,
        ),
      ).toEqual([])
    })
  })
})
