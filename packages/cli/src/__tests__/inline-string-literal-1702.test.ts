// Integration test for piconic-ai/barefootjs#1702 — `bf build` must not
// mangle string-literal contents when inlining a local (non-component)
// module into a client component's chunk. A data module exporting a code
// snippet (a string whose *contents* look like real code) used to have its
// `@barefootjs/client` specifier rewritten to `./barefoot.js` (bug B). This
// exercises the genuine inline path (`resolveRelativeImports`) followed by
// the step-6c specifier normalisation.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { rewriteBarefootClientSpecifiers } from '../lib/build'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-1702-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('inline string-literal preservation (bf#1702)', () => {
  test('inlined code-snippet module keeps @barefootjs/client text verbatim', async () => {
    // The data module: a snippet whose content has a `"use client"` line and
    // an `import … from '@barefootjs/client'` line.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'sample.ts'),
      [
        'export const SAMPLE = `"use client"',
        '',
        "import { createSignal } from '@barefootjs/client'",
        '',
        'export function Counter() {}`',
      ].join('\n') + '\n',
    )

    // The compiled client component: a real runtime import plus the data
    // import that resolveRelativeImports will inline.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'Repro.client.js'),
      [
        "import { hydrate, createSignal } from '@barefootjs/client/runtime'",
        "import { SAMPLE } from './sample'",
        "hydrate('Repro', (el) => { return SAMPLE })",
      ].join('\n') + '\n',
    )

    const manifest = {
      Repro: {
        clientJs: 'components/Repro.client.js',
        markedTemplate: 'components/Repro.tsx',
      },
    }

    // Step 6b — inline ./sample into Repro.client.js.
    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    // Step 6c — normalise @barefootjs/client specifiers to ./barefoot.js.
    let content = readFileSync(resolve(COMPONENTS_DIR, 'Repro.client.js'), 'utf8')
    content = rewriteBarefootClientSpecifiers(content, './barefoot.js')

    // The real runtime import is rewritten…
    expect(content).toContain("from './barefoot.js'")
    // …but the SAMPLE snippet's contents are untouched: `@barefootjs/client`
    // survives and the directive/import lines stay inside the string.
    expect(content).toContain("import { createSignal } from '@barefootjs/client'")
    expect(content).toContain('"use client"')
    expect(content).toContain('export function Counter() {}')
    // The snippet's runtime import was NOT relocated into the string and the
    // `@barefootjs/client` text was NOT corrupted to ./barefoot.js.
    expect(content).not.toContain("createSignal } from './barefoot.js'\n\nexport function Counter")

    // And the real runtime import line still binds `hydrate` (it lives below
    // the inlined `__bf_inline_0` IIFE, not at the very top).
    const runtimeImport = content
      .split('\n')
      .find(l => l.startsWith('import ') && l.includes("from './barefoot.js'"))
    expect(runtimeImport).toBeDefined()
    expect(runtimeImport).toContain('hydrate')
  })
})
