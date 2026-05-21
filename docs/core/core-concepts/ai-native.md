---
title: AI-native Development
description: Millisecond IR tests and the bf CLI for human + agent workflows
---

# AI-native Development

BarefootJS is designed so both humans and AI agents can build components without reading source files. Two pillars carry that:

1. **IR tests** verify component structure in milliseconds, no browser required.
2. **The `bf` CLI** drives discovery, scaffolding, testing, and debugging — every command supports `--json` for machine consumption.

## IR Tests

`renderToTest()` verifies component structure, signals, events, and accessibility against the compiler's IR — in milliseconds, without a browser. Real interactions and visual behavior still need E2E tests, but structural issues are caught before you get there:

> **Test runner**: the snippet below uses `bun:test`. `bf init` picks the runner that matches your package manager — bun users get `bun:test`, everyone else gets [Vitest](https://vitest.dev) (`from 'vitest'`). The surfaces are API-compatible, so swap the import line if you're following along under npm / pnpm / yarn. `bf gen test` and `bf gen component` emit the right line for you.

```tsx
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'Counter.tsx'), 'utf-8')

describe('Counter', () => {
  const ir = renderToTest(source, 'Counter.tsx')

  test('compiles cleanly with a `count` signal', () => {
    expect(ir.errors).toEqual([])
    expect(ir.signals).toContain('count')
  })

  test('has a button wired to a click handler', () => {
    const button = ir.find({ tag: 'button' })
    expect(button).not.toBeNull()
    expect(button!.events).toContain('click')
  })
})
```

`renderToTest(source, filePath)` takes the component source as a string and returns a queryable `TestResult` (`root`, `signals`, `memos`, `errors`, plus `find`/`findAll`/`findByText` for traversal). The same call shape is what `bf gen component` and `bf gen test` write — see the auto-generated `index.test.tsx` next to any component for a richer worked example.

See [IR Schema Reference](../advanced/ir-schema.md) for the full specification.

## CLI Workflow

Install via `npm create barefootjs@latest`. Run `bf --help` for the full command surface — this section shows the daily loop, not the manual page.

A typical component task is one straight line:

```
search → docs → add → <pm> test → debug
```

```bash
bf search dialog          # find a component in the registry + docs
bf docs dialog            # read its API (props, examples, a11y)
bf add dialog             # copy it into your project
<pm> test                 # verify the IR (bun test / npm test / pnpm test / yarn test)
bf debug graph dialog     # inspect reactivity
```

When nothing in the registry fits, `bf gen component <name> <comps...>` scaffolds a new component composed from existing ones, with an IR test stub. When a signal doesn't update what you expect, `bf debug trace <comp> <signal>` walks the propagation path.

**Visual preview**: hosted previews live at [ui.barefootjs.dev/components/&lt;name&gt;](https://ui.barefootjs.dev). Standalone `bf preview` for npm-installed projects is tracked in [#885](https://github.com/piconic-ai/barefootjs/issues/885).

## Agent Loop

The same workflow driven by an AI agent — say, "add a settings form":

```bash
bf search settings-form --json
bf docs field --json
bf docs switch --json
bf gen component settings-form field switch label
# edit components/ui/settings-form/index.tsx
bun test components/ui/settings-form/index.test.tsx   # or `npm test -- <path>`, `pnpm test <path>`, etc.
bf debug graph settings-form
```

No source files read — the CLI is the API.
