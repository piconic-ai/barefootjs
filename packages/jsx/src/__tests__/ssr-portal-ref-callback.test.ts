/**
 * `isSsrPortalRefCallback` (#3059) — structural (AST-only) recognition of
 * the `ref`-callback SSR-portal pattern the Dialog/DropdownMenu/Popover/
 * Portal primitives use: a `ref` bound to a local named callback whose
 * body directly calls `createPortal(<own param>, document.body, {
 * ownerScope: … })`. A match sets `IRElement.ssrPortalOwnerScope`, which
 * the Hono adapter (the only one with an SSR portal outlet so far) uses
 * to route the element through its `<BfPortals />` outlet instead of
 * rendering it inline.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, analyzeComponent, jsxToIR, type ComponentIR, type IRElement, type IRNode } from '../index'
import { TestAdapter } from '../adapters/test-adapter'

function root(src: string): IRNode {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
  const ir = JSON.parse(result.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return ir.root
}

/** Like {@link root}, but targets ONE named component in a multi-export
 *  file — `compileJSX`'s single-IR output only carries one component's
 *  tree, so a same-file scoping test needs to pick which. */
function rootFor(src: string, componentName: string): IRNode {
  const ctx = analyzeComponent(src.trimStart(), 'T.tsx', componentName)
  const node = jsxToIR(ctx)
  if (!node) throw new Error(`jsxToIR returned null for ${componentName}`)
  return node
}

function flaggedRefs(node: IRNode): string[] {
  const out: string[] = []
  const visit = (n: IRNode): void => {
    if (n.type === 'element') {
      if ((n as IRElement).ssrPortalOwnerScope) out.push((n as IRElement).ref!)
      for (const c of (n as IRElement).children) visit(c)
    } else if ('children' in n && Array.isArray((n as { children?: IRNode[] }).children)) {
      for (const c of (n as { children: IRNode[] }).children) visit(c)
    }
  }
  visit(node)
  return out
}

describe('isSsrPortalRefCallback (#3059)', () => {
  test('flags an element whose ref callback directly calls createPortal(el, document.body, { ownerScope })', () => {
    const ir = root(`
'use client'
import { createSignal, createPortal, isSSRPortal } from '@barefootjs/client'
export function P() {
  const [open, setOpen] = createSignal(false)
  const moveToBody = (el: HTMLElement) => {
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <div>
      <div data-testid="content" hidden={!open()} ref={moveToBody} />
    </div>
  )
}
`)
    expect(flaggedRefs(ir)).toEqual(['moveToBody'])
  })

  test('does not flag a ref callback with no createPortal call', () => {
    const ir = root(`
'use client'
export function P() {
  const handleMount = (el: HTMLElement) => {
    el.focus()
  }
  return <input ref={handleMount} />
}
`)
    expect(flaggedRefs(ir)).toEqual([])
  })

  test('does not flag createPortal(el, document.body) with no ownerScope option', () => {
    // Without `ownerScope`, the client `createPortal` never stamps
    // `bf-po` — SSR placing the element at the outlet and adding
    // `bf-po` would itself be a NEW SSR/hydration mismatch.
    const ir = root(`
'use client'
import { createPortal } from '@barefootjs/client'
export function P() {
  const moveToBody = (el: HTMLElement) => {
    createPortal(el, document.body)
  }
  return <div ref={moveToBody} />
}
`)
    expect(flaggedRefs(ir)).toEqual([])
  })

  test('does not flag createPortal targeting a DIFFERENT container', () => {
    const ir = root(`
'use client'
import { createPortal } from '@barefootjs/client'
export function P() {
  const moveElsewhere = (el: HTMLElement) => {
    const target = document.getElementById('portal-root')!
    createPortal(el, target, { ownerScope: el })
  }
  return <div ref={moveElsewhere} />
}
`)
    expect(flaggedRefs(ir)).toEqual([])
  })

  test('two sibling components with their own same-named, differently-behaved ref callback are scoped independently (no cross-closure false positive)', () => {
    // Regression pin: an earlier whole-file scan for the callback's
    // declaration matched the LAST `handleMount` in the file regardless
    // of which component's closure the `ref` actually referenced — e.g.
    // `DialogTrigger`'s own `handleMount` (unrelated to portals) getting
    // misattributed to `DialogOverlay`'s `handleMount` (which portals)
    // just because it was declared later in the same source file.
    const src = `
'use client'
import { createPortal, isSSRPortal } from '@barefootjs/client'
export function Trigger() {
  const handleMount = (el: HTMLElement) => {
    el.dataset.state = 'closed'
  }
  return <button ref={handleMount} />
}
export function Overlay() {
  const handleMount = (el: HTMLElement) => {
    if (el.parentNode !== document.body && !isSSRPortal(el)) {
      createPortal(el, document.body, { ownerScope: el })
    }
  }
  return <div ref={handleMount} />
}
`
    // Trigger's own `handleMount` (declared FIRST in the file) must never
    // be treated as a match just because a LATER same-named declaration
    // elsewhere in the file happens to portal.
    expect(flaggedRefs(rootFor(src, 'Trigger'))).toEqual([])
    // Overlay's own `handleMount` is flagged from ITS OWN closure.
    expect(flaggedRefs(rootFor(src, 'Overlay'))).toEqual(['handleMount'])
  })
})
