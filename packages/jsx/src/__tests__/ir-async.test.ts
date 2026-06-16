import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { ErrorCodes } from '../errors'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRAsync, IRElement } from '../types'

const adapter = new TestAdapter()

describe('<Async> streaming boundary', () => {
  test('transforms <Async> with fallback and children into IRAsync', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function ProductPage() {
        return (
          <div>
            <Async fallback={<p>Loading...</p>}>
              <ProductDetail />
            </Async>
          </div>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ProductPage.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('element')

    const div = ir as IRElement
    // Find the async node in children
    const asyncNode = div.children.find(c => c.type === 'async') as IRAsync
    expect(asyncNode).toBeDefined()
    expect(asyncNode.type).toBe('async')
    expect(asyncNode.id).toBe('a0')

    // Fallback should be a <p> element
    expect(asyncNode.fallback.type).toBe('element')
    if (asyncNode.fallback.type === 'element') {
      expect(asyncNode.fallback.tag).toBe('p')
    }

    // Children should contain the component
    expect(asyncNode.children.length).toBe(1)
    expect(asyncNode.children[0].type).toBe('component')
  })

  test('assigns sequential IDs to multiple async boundaries', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function Dashboard() {
        return (
          <div>
            <Async fallback={<p>Loading A...</p>}>
              <SectionA />
            </Async>
            <Async fallback={<p>Loading B...</p>}>
              <SectionB />
            </Async>
          </div>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Dashboard.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    const div = ir as IRElement
    const asyncNodes = div.children.filter(c => c.type === 'async') as IRAsync[]

    expect(asyncNodes.length).toBe(2)
    expect(asyncNodes[0].id).toBe('a0')
    expect(asyncNodes[1].id).toBe('a1')
  })

  test('fallback can be a self-closing element', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function Page() {
        return (
          <Async fallback={<Skeleton />}>
            <Content />
          </Async>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    const asyncNode = ir as IRAsync
    expect(asyncNode.type).toBe('async')

    // Fallback should be a component
    expect(asyncNode.fallback.type).toBe('component')
  })

  test('reports BF046 when fallback prop is missing and emits a fragment stub', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function Page() {
        return (
          <Async>
            <Content />
          </Async>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    const error = ctx.errors.find(e => e.code === ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING)
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
    expect(error?.message).toContain('fallback')

    // The dispatcher stays non-null so downstream walkers (parseFallbackProp,
    // transformJsxFunctionCall, etc.) don't silently coerce. Children are
    // walked so any descendant diagnostics still accumulate.
    expect(ir?.type).toBe('fragment')
  })

  test('reports BF046 when self-closing <Async /> is missing fallback', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function Page() {
        return <Async />
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    const error = ctx.errors.find(e => e.code === ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING)
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
    expect(error?.message).toContain('fallback')
    expect(ir?.type).toBe('fragment')

    // Empty stub at root must NOT emit `needsScopeComment` — a bare
    // bf-scope comment would let the runtime fall back to
    // comment.parentElement, hydrating the broken component against its
    // parent container instead of an isolated boundary.
    if (ir?.type === 'fragment') {
      expect(ir.children.length).toBe(0)
      expect(ir.needsScopeComment).toBeUndefined()
    }
  })

  // -------------------------------------------------------------------------
  // #1375 — body throw, sync + async error paths.
  //
  // Whether the body throws (sync) or rejects (async) is a *runtime* property
  // the compiler can't observe. What Layer 1 can lock in is the structural
  // prerequisite for the runtime fallback to fire: the boundary keeps a
  // fallback distinct from its children, with an assigned id, even when the
  // body is a component that will throw / reject at render time. The adapter
  // then wires that fallback into an error-catching boundary (`ErrorBoundary`
  // for Hono — see the adapter `renderAsync` test and
  // `packages/adapter-hono/src/async.tsx`).
  // -------------------------------------------------------------------------

  test('body component that throws at render keeps fallback + child wired on the boundary', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function Page() {
        return (
          <Async fallback={<p>Fallback</p>}>
            <Throws />
          </Async>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    expect(ctx.errors.filter(e => e.severity === 'error')).toEqual([])

    const asyncNode = ir as IRAsync
    expect(asyncNode.type).toBe('async')
    expect(asyncNode.id).toBe('a0')
    // Fallback is preserved and distinct from the (throwing) body.
    expect(asyncNode.fallback.type).toBe('element')
    if (asyncNode.fallback.type === 'element') {
      expect(asyncNode.fallback.tag).toBe('p')
    }
    expect(asyncNode.children.length).toBe(1)
    expect(asyncNode.children[0].type).toBe('component')
  })

  test('async (Promise-returning) body component keeps the boundary intact', () => {
    const source = `
      import { Async } from '@barefootjs/client'
      export function Page() {
        return (
          <Async fallback={<Skeleton />}>
            <SlowData />
          </Async>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    expect(ctx.errors.filter(e => e.severity === 'error')).toEqual([])

    const asyncNode = ir as IRAsync
    expect(asyncNode.type).toBe('async')
    expect(asyncNode.fallback.type).toBe('component')
    expect(asyncNode.children.length).toBe(1)
    expect(asyncNode.children[0].type).toBe('component')
  })

  test('compileJSX surfaces BF046 in errors without crashing on multi-child stub', () => {
    // Multi-child + root pins the scope-metadata path: a transparent stub
    // would suppress needsScopeComment and leak ctx.isRoot to only the first
    // child. Whatever the adapter chooses to emit, compileJSX must not throw
    // and the BF046 diagnostic must reach result.errors so consumers can
    // fail the build.
    const source = `
      import { Async } from '@barefootjs/client'
      export function Page() {
        return (
          <Async>
            <header>a</header>
            <footer>b</footer>
          </Async>
        )
      }
    `

    const result = compileJSX(source, 'Page.tsx', { adapter })

    const error = result.errors.find(e => e.code === ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING)
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
  })
})
