---
title: AI-native Development
description: Testable IR, CLI discovery, and workflows designed for AI-assisted development
---

# AI-native Development

> **Design Principle — AI-native development.**
> The compiler produces an IR that can be tested without a browser, enabling fast component tests via `renderToTest()`. Combined with a CLI for component discovery (`barefoot search`, `barefoot ui`), AI agents can autonomously scaffold, test, and iterate on UI components.

## Testable Without a Browser

The compiler produces a structured **Intermediate Representation** (IR) — a JSON tree that describes a component's structure, reactive bindings, event handlers, and accessibility attributes. This IR can be inspected and tested directly, without rendering to a DOM or launching a browser.

### `renderToTest()`

`renderToTest()` compiles a JSX component and returns its IR for assertions:

```tsx
import { renderToTest } from '@barefootjs/test-utils'

test('Counter has a button with click handler', () => {
  const ir = renderToTest(<Counter />)

  expect(ir).toContainElement('button')
  expect(ir).toHaveEventHandler('click')
  expect(ir).toHaveSignal('count', { initialValue: 0 })
})
```

Tests run in milliseconds — no browser, no DOM, no waiting. This makes component development fast and CI-friendly.

### What the IR Captures

The IR contains everything needed to verify a component's behavior:

- **Structure** — Element tree, attributes, text content
- **Reactivity** — Signals, effects, memos, and their dependencies
- **Events** — Handler bindings and target elements
- **Accessibility** — ARIA attributes, roles, keyboard interactions
- **Styles** — Class bindings, conditional classes

See [IR Schema Reference](../advanced/ir-schema.md) for the full node type specification.

## CLI for Component Discovery

The `barefoot` CLI provides structured access to component APIs and documentation:

```bash
# Search for components by name, category, or tags
barefoot search dialog

# Get full component reference: props, examples, accessibility
barefoot ui accordion

# Look up core framework docs
barefoot core signals
```

AI agents use these commands to discover available components, understand their APIs, and generate correct usage without reading source files.

## AI-Assisted Workflow

The combination of testable IR and CLI discovery enables a complete AI-assisted development loop:

```
1. barefoot search → Find the right component
2. barefoot ui <name> → Learn its API
3. Write JSX using the component
4. renderToTest() → Verify structure and behavior
5. Iterate until tests pass
```

Each step produces structured, parseable output. No screenshots, no browser automation, no flaky visual assertions.
