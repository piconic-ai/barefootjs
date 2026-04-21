---
title: AI-native Development
description: Millisecond component tests via IR, CLI-driven component discovery
---

# AI-native Development

`renderToTest()` verifies component structure, signals, events, and accessibility against the compiler's IR — in milliseconds, without a browser. Real interactions and visual behavior still need E2E tests, but structural issues are caught before you get there:

```tsx
import { renderToTest } from '@barefootjs/test-utils'

test('Counter has a button with click handler', () => {
  const ir = renderToTest(<Counter />)

  expect(ir).toContainElement('button')
  expect(ir).toHaveEventHandler('click')
  expect(ir).toHaveSignal('count', { initialValue: 0 })
})
```

See [IR Schema Reference](../advanced/ir-schema.md) for the full specification.

## CLI for AI Workflows

The `barefoot` CLI provides structured access to discovery, scaffolding, and debugging. All commands support `--json` for machine-readable output.

```bash
# Discover
barefoot search dialog              # Find by name/category/tags
barefoot ui accordion               # Props, examples, a11y
barefoot core signals               # Framework docs

# Scaffold
barefoot scaffold settings-form input switch button  # Component skeleton + IR test
barefoot test:template Button                        # Generate IR test from existing source

# Inspect reactive structure
barefoot inspect Counter             # Signal dependency graph
barefoot why-update Counter count    # Trace update path: signal → DOM
barefoot why-wrap calendar           # List Solid-style wrap-by-default fallback bindings
```

Both humans and AI agents use these commands to generate and debug components without reading source files.
