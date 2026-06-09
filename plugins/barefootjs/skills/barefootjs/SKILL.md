---
name: barefootjs
description: "Build, inspect, and debug UI components using @barefootjs/cli. Use when: creating/editing/reviewing components, investigating signal dependencies, debugging reactive updates, scaffolding new components, or looking up component APIs."
metadata:
  short-description: "BarefootJS component development with bf CLI"
---
# Component Development Skill

Build UI components using `@barefootjs/cli` for component discovery, scaffolding, testing, and signal inspection.

## Setup

Ensure the CLI is available. If the project doesn't already have it installed:

```bash
npx @barefootjs/cli --help
```

Or install it as a dev dependency:

```bash
npm install -D @barefootjs/cli
# or
bun add -d @barefootjs/cli
```

Once installed, use `npx @barefootjs/cli` (or `bunx @barefootjs/cli`) to run commands.

> **Version requirement:** `debug profile` (below) requires **`@barefootjs/cli` >= 0.11.0** — the release that introduced the reactive profiler. The other commands work on earlier versions. Check with `npx @barefootjs/cli --version`.

## Workflow

1. `npx @barefootjs/cli search <query>` — Find components and docs by name/category/tags
2. `npx @barefootjs/cli docs <component>` — Get props, examples, accessibility info
3. `npx @barefootjs/cli guide <topic>` — Read framework docs (signals, compiler constraints, etc.)
4. `npx @barefootjs/cli gen component <name> <comp...>` — Generate skeleton + basic IR test
5. Implement the component
6. Run tests — Verify compilation
7. `npx @barefootjs/cli gen test <name>` — Regenerate richer IR test
8. Run tests — Final verification
9. Create previews and run `npx @barefootjs/cli preview <name>` — Visual preview in browser
10. Ask the user to check the browser for visual/interaction verification

## Signal Inspection & Debugging

Use these commands to understand and debug a component's reactive structure. Most analysis is **static** (from the IR) and runs no code; the one exception is `debug profile --scenario`, which mounts and measures a real run.

### `npx @barefootjs/cli debug graph <component>`

Show the signal dependency graph for a component. Use this **before modifying** a stateful component to understand its reactive structure: which signals exist, what memos depend on them, and which DOM nodes are bound.

- Add `--json` for machine-readable output.
- Example: `npx @barefootjs/cli debug graph combobox`

### `npx @barefootjs/cli debug trace <component> <signal|memo>`

Reverse-lookup: trace the full propagation path from a signal/memo to every DOM binding it affects. Use this to answer "why does this DOM node update?" or to verify that a signal change reaches the expected targets.

- If the signal name is wrong, the CLI lists available signals/memos.
- Add `--json` for machine-readable output.
- Example: `npx @barefootjs/cli debug trace combobox open`

### `npx @barefootjs/cli debug signals <component>`

Show a signal initialization trace: every signal, its initial value, and its effect bindings. Useful for verifying that signals are wired correctly in a newly written or modified component.

- Add `--json` for machine-readable output.
- Example: `npx @barefootjs/cli debug signals select`

### `npx @barefootjs/cli debug fallbacks <component>`

Surface fallback-wrapped expressions emitted by Solid-style wrap-by-default. Use this to find candidates for `createMemo` refactor — places where the compiler couldn't statically prove reactivity and fell back to wrapping.

- Add `--json` for machine-readable output.
- Example: `npx @barefootjs/cli debug fallbacks combobox`

### `npx @barefootjs/cli debug profile <component>`

Reactive performance profiler — find wasted reactive work (re-runs that produce nothing, fan-out that fires too widely, multi-write turns that could `batch()`). Every finding maps back to a source line. **Requires `@barefootjs/cli` >= 0.11.0.** Three modes:

- `debug profile <component>` — **static reactivity budget** (no run): signal/memo/effect/loop counts, total subscriptions, the longest memo→memo chain, and per-signal fan-out (flagged `⚠ high`). A pure function of the IR, so it works the moment a component compiles. Predicts hot spots before you measure.
- `debug profile <component> --diff <ref>` — **compile-diff regression** (no run): compiles the component at a git ref and at the working tree, prints the structural delta (`+effects`, `fan-out 3→9`, deepened memo chain, …), and exits non-zero when a metric grew — so it is CI-able.
- `debug profile <component> --scenario auto` — **dynamic measured run**: mounts the instrumented build in a headless DOM, fires every handler once, and ranks hot subscribers / wasted re-runs / `batch()` candidates / coverage. Unlike the other inspection commands this one runs code, so it needs the client runtime built (`bun run build`). For a compound/headless component whose handlers live in composed children, pass a story `.tsx` instead of `auto`.

- Add `--json` for machine-readable output (every mode).
- Composes with `debug graph`/`trace`: those say *where to look*, `profile` says *what it cost and what to change*, citing the same source lines.
- Example: `npx @barefootjs/cli debug profile calendar` (static budget) · `... calendar --scenario auto` (measured) · `... calendar --diff origin/main` (CI gate)

### When to use inspection

- **Before editing a stateful component** — run `debug graph` to map the reactive graph.
- **Unexpected re-renders or missing updates** — run `debug trace` to trace propagation.
- **After implementing a new component** — run `debug signals` to verify signal wiring.
- **Reviewing a PR** — run `debug graph --json` to diff the dependency graph before/after, or `debug profile --diff <ref>` to gate on reactive-budget regressions.
- **Performance review / wasted re-renders** — run `debug profile` for the static budget, then `debug profile --scenario auto` to measure actual hot subscribers and `batch()` candidates.

## Previews

Previews provide visual preview with full hydration support.

### File location

`ui/components/ui/__previews__/<name>.previews.tsx`

### Format

Each `export function` becomes a separate preview. PascalCase names are auto-converted to display titles (e.g., `WithLabel` → "With Label").

```tsx
"use client"

import { ComponentName } from '../component-name'

/** Default usage */
export function Default() {
  return <ComponentName />
}

/** Show a specific variant or state */
export function WithProps() {
  return <ComponentName variant="outline" disabled />
}
```

### Guidelines

- Always include a `Default` preview showing basic usage.
- Add previews for key variants, states, and compositions (e.g., `WithLabel`, `Disabled`, `PreFilled`).
- Previews that use signals need `"use client"` at the top.
- Import components via relative path from `../` (e.g., `import { Button } from '../button'`).
- After creating previews, run `npx @barefootjs/cli preview <name>` and ask the user to verify in the browser.

## Rules

- Use `bf search` and `bf docs` for component discovery. Do not read source files to learn component APIs.
- Use `bf guide error-codes` to check compiler constraints (BF001, BF021, etc.) before writing components.
- New components go in `ui/components/ui/<name>.tsx`.
- IR tests go in `ui/components/ui/__tests__/<name>.test.ts`.
- Stateful components (using signals) must have `"use client"` as the first line.
- Stateful components must use `props.xxx` (not destructuring) to maintain reactivity.
- Use `createSignal`, `createMemo`, `createEffect` from `@barefootjs/client` (SolidJS-style, not React hooks).
- Use `for` attribute on `<Label>` (not `htmlFor`).
- Event handlers have typed `e.target` — write `onInput={e => setValue(e.target.value)}` directly. Do not cast with `as HTMLInputElement`.
- Use `className` in JSX (not `class`). `class` is a JS reserved keyword.
- Signal getters must be called in JSX: `value={name()}` (not `value={name}`).
