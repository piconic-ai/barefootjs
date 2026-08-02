/**
 * CSR template scope soundness (#2468 / adapter-tests scope-gate holes).
 *
 * The `hydrate('X', { template: (_p) => ... })` lambda runs at module
 * scope, so every identifier it references must be either `_p`, a
 * template-local binding, or a global. These tests pin the three
 * emission paths that leaked init-scoped bindings into the lambda
 * (each one a guaranteed `ReferenceError` on CSR mount):
 *
 *  A. a memo body inlined into the template kept its bare destructured
 *     prop refs (`(value * 10)` instead of `(_p.value * 10)`);
 *  B. a component prop carrying a template literal over a destructured
 *     prop rendered into `renderChild(...)` un-rewritten
 *     (`${className}` instead of `${_p.className}`);
 *  C. a getter-elided signal (`const [, setActive] = createSignal(0)`)
 *     was dropped from init entirely while its setter stayed referenced
 *     by the emitted handler.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function clientJsOf(source: string): string {
  const result = compileJSX(source, 'scope-soundness.tsx', { adapter: new HonoAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const clientJs = result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n')
  expect(clientJs).not.toBe('')
  return clientJs
}

/** The registration template lambda's source, extracted per component. */
function templateLambdaOf(clientJs: string, name: string): string {
  const start = clientJs.indexOf(`hydrate('${name}'`)
  expect(start).toBeGreaterThan(-1)
  const end = clientJs.indexOf('\n', start)
  return clientJs.slice(start, end === -1 ? undefined : end)
}

describe('CSR template scope soundness (#2468)', () => {
  test('A: memo body inlined into the template rewrites destructured prop refs to _p.*', () => {
    const clientJs = clientJsOf(`
"use client"
import { createMemo } from '@barefootjs/client'

export function Derived({ value }: { value: number }) {
  const doubled = createMemo(() => value * 10)
  return <span>{doubled()}</span>
}
`)
    const template = templateLambdaOf(clientJs, 'Derived')
    expect(template).toContain('_p.value * 10')
    expect(template).not.toMatch(/[^.\w]value \* 10/)
  })

  test('B: component-prop template literal rewrites destructured prop refs to _p.*', () => {
    const clientJs = clientJsOf(`
"use client"
import { Slot } from './slot'

const base = 'chip'

interface BaseProps { className?: string }
interface ChipProps extends BaseProps { asChild?: boolean; children?: unknown }

export function Chip({ className = '', asChild = false, children, ...props }: ChipProps) {
  const classes = \`\${base} \${className}\`
  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>
  }
  return <span class={classes} {...props}>{children}</span>
}
`)
    const template = templateLambdaOf(clientJs, 'Chip')
    // The renderChild props object must read the prop off _p, exactly
    // like the sibling element attribute already does.
    expect(template).not.toMatch(/\$\{className\}/)
    expect(template).toContain('_p.className')
  })

  test('C: a getter-elided signal declaration still lands in init', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

export function Fire() {
  const [, setFlag] = createSignal(0)
  return <button onClick={() => setFlag(1)}>go</button>
}
`)
    // The setter is referenced by the click handler, so its declaring
    // statement must exist in the emitted init.
    expect(clientJs).toMatch(/setFlag\s*\]\s*=\s*createSignal\(0\)/)
  })
})
