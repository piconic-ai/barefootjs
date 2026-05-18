---
title: CLI Workflow
description: Build, discover, and debug components with the bf CLI — the spec-first feedback loop
---

# CLI Workflow

`bf` is the BarefootJS command-line tool. It handles everything between *"I need a button"* and *"the signal graph looks right"* — without leaving your terminal, and without scraping component source files.

## Install

```bash
npm create barefootjs@latest my-app
cd my-app
```

The `npm create` flow scaffolds the project and installs `@barefootjs/cli`, exposing the `bf` command via `npx bf` or `bun run bf`. From inside the project root:

```bash
bf --help
```

## The Loop

A typical component workflow is one straight line:

```
search → docs → add → (gen test) → bun test → preview → debug
```

You rarely need every step, but each one stands alone. The rest of this page walks the loop end-to-end with a single example — adding a `Button`, verifying it, previewing it, and inspecting its reactivity.

---

## 1. Discover — `bf search`

Find a component or a doc page by name, category, or tag.

```bash
bf search button
```

```
NAME                     TYPE        CATEGORY        DESCRIPTION
----------------------------------------------------------------
button                   component   input           A versatile button component with variants
button-group             component   input           Grouped action buttons sharing visual context
toggle                   component   input           Two-state button for on/off settings
...
```

`bf search` indexes the public registry (`https://ui.barefootjs.dev/r` by default) plus framework docs. Use `--registry <url>` to point at a private mirror, or `--dir <path>` to search a local checkout.

## 2. Read — `bf docs` and `bf guide`

Two layers of documentation, two commands:

| Command | What it shows |
|---------|---------------|
| `bf docs <component>` | Per-component API: props, examples, accessibility notes, slots |
| `bf guide [topic]`    | Framework guides: reactivity, adapters, rendering, concepts |

```bash
bf docs button
```

```
# Button
Category: input | Stateful: no
Tags: aria

## Props
  variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size:    'default' | 'sm' | 'lg' | 'icon'
  ...
```

```bash
bf guide                    # list all topics
bf guide reactivity         # show one topic
```

Both commands accept `--json` for machine-readable output (useful for editor integrations and AI agents — see [AI workflows](#ai-coding-workflows) below).

## 3. Add — `bf add`

Copy a component into your project, with its dependencies resolved transitively.

```bash
bf add button
```

The component lands in `ui/components/ui/button/` — source you own and can edit. Add multiple components in one shot:

```bash
bf add button input field label
```

Use `--force` to overwrite an existing copy, or `--registry <url>` to pull from a private registry.

## 4. Build something new — `bf gen`

When you need a component that doesn't exist in the registry, scaffold it instead of writing from scratch.

```bash
bf gen component signup-form input button field
```

This creates:

- `ui/components/ui/signup-form/index.tsx` — JSX skeleton that composes the listed components
- `ui/components/ui/signup-form/index.test.tsx` — IR test stub
- `ui/components/ui/signup-form/index.preview.tsx` — preview entry

For an existing component that lacks a test, generate just the test:

```bash
bf gen test button
```

For preview-only generation (the visual playground entry):

```bash
bf gen preview button
```

## 5. Verify — IR tests

Component tests run against the compiler's IR — structure, signals, event handlers, accessibility — in milliseconds, without a browser.

```bash
bun test ui/components/ui/button/index.test.tsx
```

```tsx
import { renderToTest } from '@barefootjs/test-utils'
import { Button } from './index'

test('Button renders an accessible button', () => {
  const ir = renderToTest(<Button>Submit</Button>)

  expect(ir).toContainElement('button')
  expect(ir).toHaveAccessibleName('Submit')
})
```

This is the spec-first feedback loop: change the component, re-run the IR test, get an answer in milliseconds. Real interactions and visual regressions still need E2E tests, but the structural issues are caught here.

See [AI-native Development](./core-concepts/ai-native.md) for the full rationale and `renderToTest` reference.

## 6. Preview — `bf preview`

Open the visual playground for a component:

```bash
bf preview button
```

Run with no argument to list what's previewable in the current project:

```bash
bf preview
```

```
46 previewable component(s):
  accordion
  alert
  alert-dialog
  ...

Open one with: bf preview <component>
```

> **Note:** Standalone `bf preview` for npm-installed projects is tracked in [#885](https://github.com/piconic-ai/barefootjs/issues/885). Until then, browse the live previews at [ui.barefootjs.dev/components](https://ui.barefootjs.dev) — every registry component has a hosted preview page at `/components/<name>`.

## 7. Debug reactivity — `bf debug`

When a signal doesn't update what you expect, four sub-commands tell you why.

```bash
bf debug graph button         # signal dependency graph
bf debug trace button count   # trace one signal's propagation path
bf debug fallbacks button     # list Solid-style wrap-by-default bindings
bf debug signals button       # signal initialization trace
```

```bash
bf debug graph counter
```

```
Counter
├─ signal: count (initial: 0)
└─ effect: count() → text@s0
```

`debug trace` is the workhorse: given a signal, it shows every reactive consumer that reruns when the signal changes — effects, memos, attribute bindings, text slots, child component updates.

`debug fallbacks` (formerly `why-wrap`) reports expressions the compiler wrapped to preserve reactivity through prop boundaries. Use it when a value isn't updating and you suspect a destructured prop is the culprit. See [Props Reactivity](./reactivity/props-reactivity.md) for the underlying mechanic.

## 8. Apply design tokens — `bf tokens`

List the active design tokens:

```bash
bf tokens                      # all tokens
bf tokens --category spacing   # one category
```

Apply a token override exported from [Studio](https://barefootjs.dev/studio):

```bash
bf tokens apply "https://studio.barefootjs.dev/?p=..."
```

This patches `tokens.css` (the runtime source of truth) directly, with a best-effort `tokens.json` patch retained for the monorepo convention. Studio's Export Bar emits the exact `bf tokens apply` command for you to paste.

---

## AI Coding Workflows

Every `bf` command supports `--json` for structured output, designed so AI coding agents (Claude Code, Cursor, etc.) can drive the loop without scraping component source files.

```bash
bf search dialog --json
bf docs accordion --json
bf debug graph counter --json
```

This is the same pipeline humans use — discover → read → add → test → debug — except the agent calls commands instead of clicking links. A typical agent loop for "add a settings form":

```bash
bf search settings-form              # is there one already?
bf docs field                        # learn the Field API
bf docs switch                       # learn the Switch API
bf gen component settings-form field switch label  # scaffold
# edit ui/components/ui/settings-form/index.tsx
bun test ui/components/ui/settings-form/index.test.tsx  # verify IR
bf debug graph settings-form         # confirm reactivity
```

See [AI-native Development](./core-concepts/ai-native.md) for the IR test layer that makes this loop fast, and `CLAUDE.md` in the project root for the Claude Code conventions BarefootJS expects.

---

## Command Reference

```
Daily:
  bf add <comp...>             Add component(s) to your project
  bf docs <comp>               Show docs for a component
  bf guide [topic]             Show framework guides
  bf search <query>            Search components and docs
  bf preview [comp]            Open visual preview (no arg lists previewable)
  bf build                     Compile components using barefoot.config.ts

Create:
  bf gen component <name> <comps...>   Scaffold a new component + IR test
  bf gen test <comp>                   Generate IR test from existing source
  bf gen preview <comp>                Generate preview entry

Tokens:
  bf tokens [--category <cat>]         List design tokens
  bf tokens apply <url>                Apply Studio token overrides

Debug:
  bf debug graph <comp>                Signal dependency graph
  bf debug trace <comp> <signal>       Trace one signal's propagation
  bf debug fallbacks <comp>            Wrap-by-default fallback bindings
  bf debug signals <comp>              Signal initialization trace

Options:
  --json                       Machine-readable output
```

Run `bf --help` for the up-to-date version.
