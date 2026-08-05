// Integration test for piconic-ai/barefootjs#1702 — inlining a local
// (non-component) module into a client component's chunk must not mangle
// string-literal contents. A data module exporting a code snippet (a
// string whose *contents* look like real code) must never have that
// content touched just because it merely *looks* like an import/directive
// line. `resolveRelativeImports` — used by `site/ui/build.ts` and
// `site/core/build.ts` to inline sibling `.ts` helper modules into their
// own compiled client JS — is what this pins.
import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
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

    // Inline ./sample into Repro.client.js.
    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const content = readFileSync(resolve(COMPONENTS_DIR, 'Repro.client.js'), 'utf8')

    // The SAMPLE snippet's contents are untouched: `@barefootjs/client`
    // survives and the directive/import lines stay inside the string.
    expect(content).toContain("import { createSignal } from '@barefootjs/client'")
    expect(content).toContain('"use client"')
    expect(content).toContain('export function Counter() {}')
    // The real runtime import (outside the string) is untouched too.
    expect(content).toContain("from '@barefootjs/client/runtime'")

    // The runtime import line still binds `hydrate`.
    const runtimeImport = content
      .split('\n')
      .find(l => l.startsWith('import ') && l.includes("from '@barefootjs/client/runtime'"))
    expect(runtimeImport).toBeDefined()
    expect(runtimeImport).toContain('hydrate')
  })
})
