/**
 * MojoAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Mojo-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { MojoAdapter } from '../adapter/mojo-adapter'
import { runJSXConformanceTests } from '@barefootjs/adapter-tests'
import { renderMojoComponent, PerlNotAvailableError } from '../test-render'
import { compileJSXSync, type ComponentIR } from '@barefootjs/jsx'

// =============================================================================
// JSX-Based Conformance Tests
// =============================================================================

runJSXConformanceTests({
  createAdapter: () => new MojoAdapter(),
  render: renderMojoComponent,
  skip: [
    'static-array-children',
    'child-component',         // include rendering not yet supported in test-render
    'multiple-instances',      // include rendering not yet supported in test-render
    'child-component-init',    // include rendering not yet supported in test-render
    'reactive-prop-binding',   // include rendering not yet supported in test-render
  ],
  onRenderError: (err, id) => {
    if (err instanceof PerlNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

// =============================================================================
// Helpers
// =============================================================================

function compileToIR(source: string, adapter?: MojoAdapter): ComponentIR {
  const result = compileJSXSync(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new MojoAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string, adapter?: MojoAdapter) {
  const a = adapter ?? new MojoAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

// =============================================================================
// Mojo-Specific Tests
// =============================================================================

describe('MojoAdapter - Template Generation', () => {
  test('generates basic element with scope marker', () => {
    const result = compileAndGenerate(`
export function Hello() {
  return <div>Hello</div>
}
`)
    expect(result.template).toContain('<div')
    expect(result.template).toContain('Hello')
    expect(result.template).toContain('bf-s=')
  })

  test('generates .html.ep extension', () => {
    const adapter = new MojoAdapter()
    expect(adapter.extension).toBe('.html.ep')
  })

  test('generates conditional with Perl if/else', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client-runtime"

export function Toggle() {
  const [active, setActive] = createSignal(false)
  return <div>{active() ? 'On' : 'Off'}</div>
}
`)
    expect(result.template).toContain('% if')
    expect(result.template).toContain('% }')
  })

  test('generates loop with Perl for', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client-runtime"

export function List() {
  const [items, setItems] = createSignal<string[]>([])
  return <ul>{items().map(item => <li>{item}</li>)}</ul>
}
`)
    expect(result.template).toContain('% for my')
    expect(result.template).toContain('$bf->comment("loop")')
    expect(result.template).toContain('$bf->comment("/loop")')
  })

  test('generates script registration for client components', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client-runtime"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`)
    expect(result.template).toContain("$bf->register_script")
    expect(result.template).toContain('barefoot.js')
    expect(result.template).toContain('Counter.client.js')
  })

  test('does not generate script registration for static components', () => {
    const result = compileAndGenerate(`
export function Static() {
  return <div>Static content</div>
}
`)
    expect(result.template).not.toContain("$bf->register_script")
  })
})
