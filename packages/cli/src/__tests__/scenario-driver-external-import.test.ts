// `externalRuntimeImport` detects — before the dynamic run, from the driver's
// own compiled client JS — the one failure mode the auto scenario can't fix: a
// component that imports an external published `@barefootjs/*` runtime package
// whose prebuilt dist imports `@barefootjs/client` directly (#1849 B3). When it
// matches, the driver swaps bun's raw module-resolution stack for an actionable
// message pointing at `--scenario <story.tsx>`. Reading our own import graph
// (rather than classifying bun's error message) keeps detection stable across
// bun versions and importer-path formatting.

import { describe, test, expect } from 'bun:test'
import { externalRuntimeImport } from '../lib/scenario-driver'

describe('externalRuntimeImport', () => {
  test('flags an external runtime package (xyflow) and names it', () => {
    const js =
      "import { hydrate } from '@barefootjs/client/runtime';\n" +
      "import { ReactFlow } from '@barefootjs/xyflow';\n"
    expect(externalRuntimeImport(js)).toBe('@barefootjs/xyflow')
  })

  test('flags chart too', () => {
    const js =
      "import { createSignal } from '@barefootjs/client/runtime'\n" +
      "import { LineChart } from '@barefootjs/chart'\n"
    expect(externalRuntimeImport(js)).toBe('@barefootjs/chart')
  })

  test('scans across multiple chunks', () => {
    const chunks = [
      "import { hydrate } from '@barefootjs/client/runtime'\n",
      "import { BarChart } from '@barefootjs/chart'\n",
    ]
    expect(externalRuntimeImport(chunks)).toBe('@barefootjs/chart')
  })

  test('does NOT flag the handled @barefootjs/client[/...] family', () => {
    const js =
      "import { createSignal, hydrate } from '@barefootjs/client/runtime'\n" +
      "import { something } from '@barefootjs/client'\n"
    expect(externalRuntimeImport(js)).toBeNull()
  })

  test('does NOT flag the compile-time @barefootjs/jsx family', () => {
    const js =
      "import { jsx } from '@barefootjs/jsx/jsx-runtime'\n" +
      "import { Fragment } from '@barefootjs/jsx'\n"
    expect(externalRuntimeImport(js)).toBeNull()
  })

  test('returns null when nothing reactive imports an external package', () => {
    expect(externalRuntimeImport("import { hydrate } from '@barefootjs/client/runtime'\n")).toBeNull()
    expect(externalRuntimeImport('const x = 1\n')).toBeNull()
  })
})
