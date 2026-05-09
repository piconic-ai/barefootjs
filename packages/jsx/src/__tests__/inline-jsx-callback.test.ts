/**
 * Inline JSX-in-arrow-callback compilation (#1211).
 *
 * Without preprocessing, `renderNode={(n) => <div>{n.data.label}</div>}`
 * leaks raw JSX into the client bundle and breaks `Function`/parser
 * loading with `SyntaxError: Unexpected token '<'`. The fix hoists
 * the inline arrow into a synthesized PascalCase component that the
 * regular pipeline compiles into init + hydrate + a callable shim.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { $ } from 'bun'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TestAdapter } from '../adapters/test-adapter'
import { compileJSX } from '../compiler'
import { createProgramForCorpus } from '../shared-program'
import type ts from 'typescript'

const adapter = new TestAdapter()

function clientJs(source: string, fileName = 'Demo.tsx'): string {
  const result = compileJSX(source, fileName, { adapter })
  expect(result.errors).toEqual([])
  const file = result.files.find(f => f.type === 'clientJs')
  expect(file).toBeDefined()
  return file!.content
}

function clientJsWithProgram(source: string, filePath: string, program: ts.Program): string {
  const result = compileJSX(source, filePath, { adapter, program })
  expect(result.errors).toEqual([])
  const file = result.files.find(f => f.type === 'clientJs')
  expect(file).toBeDefined()
  return file!.content
}

describe('inline JSX in arrow callback (#1211)', () => {
  test('rewrites renderNode={(n) => <jsx/>} into a synthesized component reference', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <div>{n.data.label}</div>}
          />
        )
      }
    `
    const js = clientJs(source)
    // The arrow body's JSX must NOT survive as live JS (which would
    // crash the parser). Template literals inside synthesized
    // `template:` strings are fine — those are just strings.
    expect(js).not.toMatch(/=>\s*<div\b/)
    expect(js).not.toMatch(/=>\s*\(\s*<div\b/)
    expect(js).not.toMatch(/return\s*<div\b/)

    // The synthesized component is registered and exported as a callable shim.
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
    expect(js).toMatch(/export function BFInlineJsxCallback1\b/)

    // The Demo's renderNode prop value references the synthesized name.
    expect(js).toContain('BFInlineJsxCallback1')
  })

  test('emits the synthesized component init alongside the host component', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <span class="badge">{n.data.label}</span>}
          />
        )
      }
    `
    const js = clientJs(source)
    expect(js).toMatch(/function init(?:BFInlineJsxCallback1|_BFInlineJsxCallback1)\b/)
  })

  test('multiple inline arrows in the same source get distinct names', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <div>
            <Flow nodes={[]} edges={[]} renderNode={(a) => <span>{a.id}</span>} />
            <Flow nodes={[]} edges={[]} renderNode={(b) => <em>{b.id}</em>} />
          </div>
        )
      }
    `
    const js = clientJs(source)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback2(?:__|['"])/)
  })

  test('block-body arrow with JSX return is rewritten the same way', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => {
              return <article>{n.data.label}</article>
            }}
          />
        )
      }
    `
    const js = clientJs(source)
    expect(js).not.toMatch(/=>\s*\{[\s\S]*<article>/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
  })

  test('arrows whose body is not JSX are left alone', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return (
          <button onClick={() => setCount(count() + 1)}>{count()}</button>
        )
      }
    `
    const js = clientJs(source)
    // No synthesized component should be emitted for plain event handlers.
    expect(js).not.toContain('BFInlineJsxCallback')
  })

  test('reports BF080 when the inline arrow captures a non-module identifier', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        const [tone, setTone] = createSignal('blue')
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <div class={tone()}>{n.data.label}</div>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors.some(e => e.code === 'BF080')).toBe(true)
    const bf080 = result.errors.find(e => e.code === 'BF080')!
    expect(bf080.message).toContain('tone')
  })

  test('module-scope identifiers do not trigger BF080', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      const PREFIX = 'badge-'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <span>{PREFIX + n.id}</span>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors.filter(e => e.code === 'BF080')).toEqual([])
  })

  test('nested inline JSX-returning arrows are hoisted via fixpoint iteration', () => {
    // The outer renderNode arrow returns JSX that itself contains a
    // <Wrapper render={(x) => <Inner/>}> — the inner arrow must also
    // be lifted, otherwise its raw JSX leaks into the synthesized
    // outer component's body.
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'
      import { Wrapper } from '@/components/ui/wrapper'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => (
              <Wrapper render={(x) => <em>{x.id}</em>}>
                {n.data.label}
              </Wrapper>
            )}
          />
        )
      }
    `
    const js = clientJs(source)
    expect(js).not.toMatch(/=>\s*<em\b/)
    expect(js).not.toMatch(/=>\s*\(\s*<em\b/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback2(?:__|['"])/)
  })

  test('locally-declared destructure / function / class bindings are not flagged as captures', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => {
              const { id, data } = n
              function fmt(s: string) { return s.toUpperCase() }
              class Helper { static k = 'k' }
              return <div data-id={id} data-k={Helper.k}>{fmt(data.label)}</div>
            }}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors.filter(e => e.code === 'BF080')).toEqual([])
  })

  test('captures via parameter default initializer are flagged as BF080', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        const [tone, setTone] = createSignal('blue')
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n, t = tone()) => <div class={t}>{n.id}</div>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors.some(e => e.code === 'BF080')).toBe(true)
    const bf080 = result.errors.find(e => e.code === 'BF080')!
    expect(bf080.message).toContain('tone')
  })

  test('non-use-client files are left untouched', () => {
    const source = `
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <div>{n.data.label}</div>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    // No BF080 — but no synthesis either; the file just doesn't ship a
    // client bundle and its arrow stays inert in the SSR template.
    expect(result.errors.filter(e => e.code === 'BF080')).toEqual([])
  })
})

/**
 * #1217 — inline-JSX-callback rewrite must survive the shared `ts.Program`
 * path. The single-call `compileJSX` flow always re-parses `compileSource`,
 * but production builds (`site/ui/build.ts`) pass an `options.program`
 * built from the on-disk corpus. Without the analyzer's source-vs-program
 * guard, the cached SourceFile masks the preprocess output and raw JSX
 * leaks into the client bundle, crashing the parser at module load.
 */
describe('inline JSX in arrow callback with options.program (#1217)', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = join(tmpdir(), `bfjs-1217-${crypto.randomUUID()}`)
  })

  afterAll(async () => {
    await $`rm -rf ${tmpDir}`.quiet()
  })

  test('preserves the BFInlineJsxCallback rewrite when a shared program is supplied', async () => {
    const source = `'use client'
import { Flow } from '@/components/ui/xyflow'

export function Demo() {
  return (
    <Flow
      nodes={[]}
      edges={[]}
      renderNode={(n) => <div>{n.data.label}</div>}
    />
  )
}
`
    const filePath = join(tmpDir, 'demo-single.tsx')
    await Bun.write(filePath, source)
    const program = createProgramForCorpus([filePath])
    const js = clientJsWithProgram(source, filePath, program)

    // Without the analyzer guard, the program's cached SourceFile would
    // mask the preprocess output and the original arrow JSX would survive.
    expect(js).not.toMatch(/=>\s*<div\b/)
    expect(js).not.toMatch(/=>\s*\(\s*<div\b/)
    expect(js).not.toMatch(/return\s*<div\b/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
    expect(js).toContain('BFInlineJsxCallback1')
  })

  test('multi-component file rewrites the inline arrow with and without a shared program', async () => {
    const source = `'use client'
import { Flow } from '@/components/ui/xyflow'

export function Sibling() {
  return <p>sibling</p>
}

export function Demo() {
  return (
    <Flow
      nodes={[]}
      edges={[]}
      renderNode={(n) => <span>{n.data.label}</span>}
    />
  )
}
`
    const filePath = join(tmpDir, 'demo-multi.tsx')
    await Bun.write(filePath, source)

    // Path A — no shared program (compileMultipleComponents builds its own).
    const noProgramJs = clientJs(source, filePath)
    expect(noProgramJs).not.toMatch(/=>\s*<span\b/)
    expect(noProgramJs).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)

    // Path B — shared program (the production case that #1217 reports).
    const program = createProgramForCorpus([filePath])
    const sharedJs = clientJsWithProgram(source, filePath, program)
    expect(sharedJs).not.toMatch(/=>\s*<span\b/)
    expect(sharedJs).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
  })
})
