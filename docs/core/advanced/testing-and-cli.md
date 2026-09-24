---
title: Testing & CLI
description: IR tests with renderToTest(), the bf CLI loop for finding, adding, and debugging components, and the agent skill for Claude Code and Codex.
---

# Testing & CLI

Two tools let you (or an agent) build components without reading framework source: IR tests that check a component's structure in milliseconds, and the `bf` CLI, whose every command takes `--json`.

## IR tests

`renderToTest()` compiles a component and returns its IR — signals, memos, errors, and a queryable element tree — with no browser involved:

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

`renderToTest(source, filePath)` returns a `TestResult` with `root`, `signals`, `memos`, `errors`, and `find` / `findAll` / `findByText` for traversal. Use it for structure, signal wiring, event handlers, classes, and ARIA attributes. Real interactions (clicks, keyboard, hydration) still need an E2E test.

`bf gen component` and `bf gen test` write this shape for you, using `bun:test` or `vitest` to match your package manager.

## CLI workflow

Install with `npm create barefootjs@latest`; `bf --help` lists every command. A component task is one straight line — search, docs, add, test, debug:

```bash
bf search dialog          # find a component in the registry + docs
bf docs dialog            # read its API (props, examples, a11y)
bf add dialog             # copy it into your project
bun test                  # verify the IR (or npm / pnpm / yarn test)
bf debug graph dialog     # inspect its signal graph
```

When nothing in the registry fits, `bf gen component <name> <comps...>` scaffolds a new component composed from existing ones, with an IR test stub. When a signal does not update what you expect, `bf debug trace <comp> <signal>` walks the propagation path. Every command accepts `--json`, so an agent runs the same loop (`bf search settings-form --json`, `bf docs field --json`, ...) without reading source files.

## Agent Skill

The BarefootJS skill gives an agent the compiler, IR, CLI, and component conventions, so it can build, test, and debug components on its own.

**Claude Code:**

```sh
/plugin marketplace add piconic-ai/barefootjs
/plugin install barefootjs@barefootjs
```

**Codex:**

```
install the barefootjs skill from piconic-ai/barefootjs
```
