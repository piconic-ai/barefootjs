import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRAsync, IRElement } from '../types'

const adapter = new TestAdapter()

describe('<Async> streaming boundary', () => {
  test('transforms <Async> with fallback and children into IRAsync', () => {
    const source = `
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

  test('reports BF046 when fallback prop is missing and emits a transparent stub', () => {
    const source = `
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

    const error = ctx.errors.find(e => e.code === 'BF046')
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
      export function Page() {
        return <Async />
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    const error = ctx.errors.find(e => e.code === 'BF046')
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
    expect(error?.message).toContain('fallback')
    expect(ir?.type).toBe('fragment')
  })

  test('compileJSX surfaces BF046 in errors without crashing on multi-child stub', () => {
    // Multi-child + root pins the scope-metadata path: a transparent stub
    // would suppress needsScopeComment and leak ctx.isRoot to only the first
    // child. Whatever the adapter chooses to emit, compileJSX must not throw
    // and the BF046 diagnostic must reach result.errors so consumers can
    // fail the build.
    const source = `
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

    const error = result.errors.find(e => e.code === 'BF046')
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
  })
})
