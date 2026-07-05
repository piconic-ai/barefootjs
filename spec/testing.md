# Testing Specification

## Overview

BarefootJS has a layered testing architecture. Each layer has a single responsibility and a clear boundary. **Do not duplicate coverage across layers.**

```
┌─────────────────────────────────────────────────────────────┐
│  E2E (Playwright)                                           │
│  Verifies: User interactions, hydration, visual rendering   │
│  Scope:    Browser-level behavior that lower layers cannot  │
│            cover (click, keyboard, hover, animations)       │
├─────────────────────────────────────────────────────────────┤
│  CSR Conformance (packages/adapter-tests/)                  │
│  Verifies: Generated client JS → correct DOM output         │
│  Scope:    Client JS execution without a browser            │
├─────────────────────────────────────────────────────────────┤
│  Adapter Conformance (packages/adapter-tests/)              │
│  Verifies: IR → HTML output is correct per adapter          │
│  Scope:    Template rendering, attribute serialization,     │
│            cross-adapter consistency via shared fixtures     │
├─────────────────────────────────────────────────────────────┤
│  Component IR (packages/test/ + ui/components/)             │
│  Verifies: Component structure, a11y, signals, classes      │
│  Scope:    "Does my component produce the right IR tree?"   │
├─────────────────────────────────────────────────────────────┤
│  Compiler Unit (packages/jsx/src/__tests__/)                │
│  Verifies: Transformation rules, error detection, analysis  │
│  Scope:    Compiler internals — parsing, analysis, codegen  │
├─────────────────────────────────────────────────────────────┤
│  Runtime Unit (packages/dom/__tests__/)                     │
│  Verifies: Signal reactivity, DOM operations, hydration     │
│  Scope:    Client-side runtime primitives                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Compiler Unit Tests

**Location:** `packages/jsx/src/__tests__/`
**Runner:** `bun test`
**Speed:** ms

### Purpose

Test the compiler's internal logic: parsing, analysis, transformation rules, and error detection. These tests exercise the functions directly (e.g., `analyzeComponent()`, `jsxToIR()`, `generateClientJs()`).

### What to test here

- **Analysis:** Signal/memo/effect detection, props extraction, import resolution
- **Error codes:** BF001, BF021, BF043, BF044, etc.
- **Expression parsing:** Ternary evaluation, filter/sort pattern detection, constant resolution
- **Client JS generation:** Import deduplication, module combination, declaration ordering
- **CSS processing:** `@layer` prefixing, type stripping

### What NOT to test here

- Component structure or HTML output → use Component IR or Adapter Conformance
- Generated marked template content → use Adapter Conformance
- Browser behavior → use E2E

### File organization

Each test file should focus on a single concern:

```
packages/jsx/src/__tests__/
  expression-parser.test.ts       — Expression parsing and resolution
  reactive-type-detection.test.ts — Signal/memo/effect detection
  props-destructuring.test.ts     — BF043: destructuring breaks reactivity
  signal-getter-not-called.test.ts— BF044: signal getter not called
  unsupported-expression.test.ts  — BF021: complex filter/sort predicates
  css-layer-prefixer.test.ts      — CSS @layer directive handling
  strip-types.test.ts             — TypeScript type stripping
  combine-client-js.test.ts       — Client JS module combination
  ir-to-client-js/
    imports.test.ts               — Import resolution for client JS
```

### Pattern

```typescript
import { analyzeComponent, jsxToIR } from '../index'

test('detects signal usage in JSX expression', () => {
  const source = `"use client"
import { createSignal } from "@barefootjs/client"
function Counter() {
  const [count, setCount] = createSignal(0)
  return <span>{count()}</span>
}`
  const ctx = analyzeComponent(source, 'test.tsx')
  expect(ctx.signals).toHaveLength(1)
  expect(ctx.signals[0].getter).toBe('count')
})

test('emits BF043 for props destructuring in stateful component', () => {
  const source = `"use client"
import { createSignal } from "@barefootjs/client"
function Comp({ value }: Props) {
  const [x] = createSignal(value)
  return <span>{x()}</span>
}`
  const ctx = analyzeComponent(source, 'test.tsx')
  expect(ctx.errors.map(e => e.code)).toContain('BF043')
})
```

---

## Layer 2: Component IR Tests

**Location:** `ui/components/ui/*/index.test.tsx` (UI components), `packages/test/__tests__/` (test infrastructure)
**Runner:** `bun test`
**Speed:** ms
**API:** `renderToTest()` from `@barefootjs/test`

### Purpose

Verify that a component's JSX produces the correct IR structure — tags, attributes, ARIA, classes, events, reactivity markers. These tests operate on the IR directly, without going through any adapter. This is the primary test layer for UI components.

### What to test here

- Component produces no compiler errors
- Correct HTML structure (tags, nesting)
- CSS classes resolve correctly (including ternary-based conditional classes)
- ARIA attributes (`role`, `aria-checked`, `aria-expanded`, etc.)
- `data-state` attributes
- Event handlers are present
- Event-handler wiring (which handler calls which signal setter)
- Reactive vs static nodes
- Signal and memo declarations exist
- Child component composition

### What NOT to test here

- Adapter-specific HTML output → use Adapter Conformance
- Client JS code generation → use Compiler Unit
- Interactive behavior — the runtime *value* after a click (e.g. "count shows 2") → use E2E.
  Note the boundary: the wiring layer proves the handler *reaches* `setCount` (the path);
  E2E proves the displayed value is correct.

### API Reference

```typescript
import { renderToTest } from '@barefootjs/test'

// renderToTest(source: string, filePath: string, componentName?: string): TestResult
// componentName is optional — when omitted, the first exported function is used.

interface TestResult {
  root: TestNode
  componentName: string
  isClient: boolean
  signals: string[]
  memos: string[]
  effects: number
  errors: Array<{ code: string; message: string; line: number }>

  find(query: TestNodeQuery): TestNode | null
  findAll(query: TestNodeQuery): TestNode[]
  findByText(text: string): TestNode | null
  toStructure(): string  // Debug: prints the IR tree
}

interface TestNodeQuery {
  tag?: string           // e.g., 'button', 'div', 'input'
  role?: string          // e.g., 'checkbox', 'dialog'
  componentName?: string // e.g., 'CheckboxIndicator'
}

interface EventHandler {
  setters: string[]      // signal setters the handler ends up calling (empty for library property-access handlers — see note below)
  via: string[]          // helper-function call chain to reach those setters
}

interface TestNode {
  tag: string | null
  type: 'element' | 'text' | 'expression' | 'conditional' | 'loop' | 'component' | 'fragment'
  children: TestNode[]
  text: string | null
  props: Record<string, string | boolean | null>
  classes: string[]
  role: string | null
  aria: Record<string, string>
  dataState: string | null
  events: string[]                              // event names, e.g. ['click']
  handlers: Partial<Record<string, EventHandler>> // event name → wiring
  reactive: boolean
  componentName: string | null

  // Event-handler wiring shorthands (resolve to handlers[name]):
  onClick?: EventHandler
  onInput?: EventHandler
  onChange?: EventHandler
  onSubmit?: EventHandler
  on(event: string): EventHandler | undefined   // any other event, e.g. on('keydown')
}
```

Both access paths agree on the "not wired" sentinel: `on('blur')` and the
shorthand getters (`onInput`, …) all return `undefined` when no handler is
wired, so a single matcher (`toBeUndefined()`) covers either accessor.

### Event-handler wiring

`renderToTest` resolves, statically, which signal setters each event handler
ends up calling — including through helper functions. This is the
**component-wiring** layer: it verifies the dependency *path* the compiler
built (handler → setter), not the runtime *value* (E2E's job).

```typescript
// <button onClick={() => setCount(n => n + 1)}>
const btn = result.find({ role: 'button' })
expect(btn!.onClick!.setters).toContain('setCount')

// Transitive: <div onPointerDown={handlePointerDown}> where
// handlePointerDown → setValue → setInternalValue
const root = result.find({ tag: 'div' })
expect(root!.on('pointerdown')!.via).toContain('setValue')        // call chain
expect(root!.on('pointerdown')!.setters).toContain('setInternalValue')
```

Assert the *path*, not the value. "Clicking + shows 2" is an E2E concern; the
wiring layer only proves "onClick reaches setCount". A handler with no setter
call (e.g. `onClick={() => console.log(x)}`) resolves to empty `setters`.

`setters`/`via` only resolve **raw signal setters declared in the component**.
Handlers wired through a library's property-access methods — e.g.
`@barefootjs/form`'s `name.handleInput` or `form.handleSubmit` — register the
event (so `on('input')`/`onInput` is defined) but report empty `setters`/`via`,
because the setter calls live inside the library, not the component body. Assert
that the event is *wired* (`expect(node.onInput).toBeDefined()`) rather than
which setter it reaches.

### Pattern

```typescript
import { renderToTest } from '@barefootjs/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, '../index.tsx'), 'utf-8')

describe('Checkbox', () => {
  const result = renderToTest(source, 'checkbox.tsx', 'Checkbox')

  test('no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('is a client component with signals', () => {
    expect(result.isClient).toBe(true)
    expect(result.signals.length).toBeGreaterThan(0)
  })

  test('renders button with checkbox role', () => {
    const button = result.find({ role: 'checkbox' })
    expect(button).not.toBeNull()
    expect(button!.tag).toBe('button')
    expect(button!.aria).toHaveProperty('checked')
  })

  test('has click event handler', () => {
    const button = result.find({ role: 'checkbox' })
    expect(button!.events).toContain('click')
  })

  test('click handler wires to the checked setter', () => {
    const button = result.find({ role: 'checkbox' })
    // handleClick → setInternalChecked / setControlledChecked
    expect(button!.onClick!.via).toContain('handleClick')
    expect(button!.onClick!.setters).toContain('setInternalChecked')
  })
})
```

---

## Layer 3: Adapter Conformance Tests

**Location:** `packages/adapter-tests/`
**Runner:** `bun test`
**Speed:** ms–seconds

### Purpose

Verify that each adapter (Hono, GoTemplate) produces correct HTML from the same IR. Tests use shared fixtures — one fixture, multiple adapters. This ensures cross-adapter consistency.

### What to test here

- Adapter produces correct HTML for a given JSX input
- Attribute serialization (boolean attrs, style, class)
- Template syntax is valid for the target backend
- Cross-adapter consistency (same fixture → same normalized HTML)

### What NOT to test here

- IR correctness → use Component IR
- Compiler analysis → use Compiler Unit
- Browser rendering → use E2E

### Fixture structure

```
packages/adapter-tests/fixtures/
  Priority 1 (Core reactivity):   counter, signal-with-fallback, memo, effect, ...
  Priority 2 (Props):             props-static, props-reactive, nested-elements
  Priority 3 (Conditionals):      ternary, logical-and, conditional-class, if-statement
  Priority 4 (Loops):             map-basic, map-with-index, filter-simple, sort-simple
  Priority 5 (Elements):          void-elements, dynamic-attributes, style-attribute
  Priority 6 (Advanced):          fragment, client-only, event-handlers
  Priority 7 (Multi-file):        child-component, multiple-instances
  Priority 8 (CSR conformance):   boolean-dynamic-attr, child-component-init, reactive-prop-binding
```

**Note on `if-statement`:** SSR renders only one branch, but client JS references markers from all branches. The SSR-Hydration contract test skips this fixture for the JS→HTML direction marker check.

### Adding a fixture

```typescript
// packages/adapter-tests/fixtures/my-feature.ts
import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'my-feature',
  description: 'Description of what this fixture tests',
  source: `
"use client"
import { createSignal } from "@barefootjs/client"
function MyComponent() {
  const [value, setValue] = createSignal(0)
  return <div>{value()}</div>
}`,
  expectedHtml: `<div bf-s="test" bf="s1">0</div>`,
})
```

Then register in `fixtures/index.ts` and both adapter test suites will automatically pick it up.

### Adapter test runner

Each adapter calls `runJSXConformanceTests()`:

```typescript
// packages/adapter-hono/__tests__/hono-adapter.test.ts
runJSXConformanceTests({
  createAdapter: () => new HonoAdapter(),
  render: async ({ adapter, source, filePath, components }) => {
    // compile and render to HTML string
  },
})
```

---

## Layer 4: CSR Conformance Tests

**Location:** `packages/adapter-tests/src/__tests__/csr-conformance.test.ts`
**Runner:** `bun test`
**Speed:** ms

### Purpose

Verify that the generated client JS produces correct DOM output when executed — without a browser. CSR conformance tests compile JSX to client JS, evaluate it in a mock runtime, and compare the rendered HTML against the same `expectedHtml` used by adapter conformance tests.

This layer catches bugs where:
- The IR is correct, but client JS codegen emits wrong code
- Boolean attribute binding uses `setAttribute()` instead of DOM property assignment
- `initChild()` calls pass wrong props or miss reactive bindings
- Hydration template functions produce different output than SSR

### What to test here

- Client JS template renders same HTML as SSR adapter output
- Dynamic boolean attribute binding (`.checked =`, `.disabled =`)
- `initChild()` prop forwarding and reactive `.value=` binding
- `renderChild()` delegation for unregistered templates
- CSR fallback behavior for signal-dependent components

### What NOT to test here

- IR structure → use Component IR or Compiler Unit
- Adapter-specific template syntax → use Adapter Conformance
- Browser interactions → use E2E

### Shared fixtures

CSR conformance tests reuse the same fixtures from `packages/adapter-tests/fixtures/`. Each fixture's `expectedHtml` serves as the reference for both SSR and CSR output. Stateless components (no client JS emitted) are automatically skipped.

### Adding a CSR-specific fixture

Most fixtures test both SSR and CSR automatically. For client-JS-only behavior (e.g., DOM property binding), add a fixture with source that exercises the pattern:

```typescript
// packages/adapter-tests/fixtures/boolean-dynamic-attr.ts
import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'boolean-dynamic-attr',
  description: 'Dynamic boolean attributes use DOM properties, not setAttribute',
  source: `
"use client"
import { createSignal } from "@barefootjs/client"
function Demo() {
  const [disabled, setDisabled] = createSignal(false)
  return <button disabled={disabled()}>Click</button>
}`,
  expectedHtml: `<button bf-s="test" bf="s1">Click</button>`,
})
```

---

## Layer 5: Runtime Unit Tests

**Location:** `packages/dom/__tests__/`
**Runner:** `bun test`
**Speed:** ms

### Purpose

Test the client-side runtime: signal creation, effect tracking, DOM operations, hydration, context API. These test the `@barefootjs/client` package in isolation.

### What to test here

- `createSignal`, `createMemo`, `createEffect`, `onCleanup`, `onMount`
- DOM query utilities (`bf()`, `bfAll()`)
- Hydration (`hydrate()`)
- Portal rendering
- List reconciliation
- Context/Provider API

### What NOT to test here

- Compilation → use Compiler Unit
- Component structure → use Component IR
- Full user flows → use E2E

---

## Layer 6: E2E Tests

**Location:** `site/ui/e2e/` (doc site), `integrations/*/e2e/` (Integration apps)
**Runner:** Playwright
**Speed:** seconds

### Purpose

Verify user-facing behavior that requires a real browser: click interactions, keyboard navigation, hover effects, form submission, hydration correctness across the full stack.

### What to test here

- Click/keyboard/hover → state changes
- Form submission and validation flows
- Dialog/popover open/close
- Hydration: server-rendered HTML becomes interactive
- Visual rendering correctness

### What NOT to test here

- Component structure → use Component IR
- Template output → use Adapter Conformance
- Signal primitives → use Runtime Unit

### Pattern

```typescript
// site/ui/e2e/checkbox.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Checkbox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/checkbox')
  })

  test('click toggles checked state', async ({ page }) => {
    // Scope to a specific demo
    const section = page.locator('[bf-s^="CheckboxDemo_"]:not([data-slot])')
    const checkbox = section.locator('button[role="checkbox"]')

    await expect(checkbox).toHaveAttribute('data-state', 'unchecked')
    await checkbox.click()
    await expect(checkbox).toHaveAttribute('data-state', 'checked')
    await expect(checkbox).toHaveAttribute('aria-checked', 'true')
  })
})
```

### Shared E2E test suites for integrations

Integration apps (`integrations/echo/`, `integrations/hono/`, `integrations/mojolicious/`) share E2E test suites from `integrations/shared/e2e/`. Each shared test function is parameterized with a `baseUrl` and optional path:

```typescript
// integrations/shared/e2e/toggle.spec.ts (shared suite)
export function toggleTests(baseUrl: string) {
  test.describe('Toggle Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/toggle`)
    })
    // ... tests ...
  })
}

// integrations/mojolicious/e2e/toggle.spec.ts (example wrapper)
import { toggleTests } from '../../shared/e2e/toggle.spec'
toggleTests('http://localhost:3004')
```

Available shared suites: `counterTests`, `toggleTests`, `formTests`, `conditionalReturnTests`, `reactivePropsTests`, `todoAppTests`, `portalTests`.

`todoAppTests` accepts an optional second parameter for the path (default `/todos`), enabling reuse for SSR variants:

```typescript
todoAppTests('http://localhost:3004', '/todos-ssr')
```

Each example's `playwright.config.ts` configures the webServer command, port, and single-worker mode for CI (to avoid shared state conflicts with `/api/todos`).

---

## Layer 7: Component × Adapter Compat Lockfile

**Location:** `packages/compat/` (repo-internal — the published CLI does not ship this tooling)
**Runner:** `bun run compat` (`bun run compat:lock` for the committed lockfile)
**Speed:** ms (in-process, no language runtimes)

### Purpose

Report whether every `ui/` component **compiles** against every workspace `TemplateAdapter`. `bun run compat -- [component…|--all] [--md] [--json]` runs `compileJSX` + the adapter's `generate()` for each component × adapter pair, entirely in-process, and renders the result as a matrix: `✓` when the compile produced no error-severity diagnostic, otherwise the `BF10x` code(s) it emitted. Known-limitation issue URLs are attached to codes automatically from the adapter's pins (see below), so a `✗` cell in the report links straight to its tracking issue.

This is a **compile-time** check only — it never invokes a language runtime (Go, Ruby, Perl, Rust, etc.) and never renders or compares HTML.

This tooling is repo-internal: `packages/compat` is a private, never-published package that depends on `@barefootjs/jsx`, all 8 adapter packages, and `@barefootjs/adapter-tests`. The published `@barefootjs/cli` package has no compat command and no dependency (declared or dynamic) on any adapter package.

### The lockfile workflow

`bun run compat:lock` runs `bun run packages/compat/src/cli.ts --all --json --out ui/compat.lock.json` and commits the result. CI (`.github/workflows/ci-compat.yml`) regenerates the lockfile on every PR touching a component, the compiler, the client runtime, `packages/compat`, or an adapter package, then runs `git diff --exit-code -- ui/compat.lock.json`. Drift fails the build with a message pointing back at `bun run compat:lock`.

The point of committing the matrix is that compatibility gains and losses show up as an ordinary PR diff — reviewers see exactly which component × adapter cells newly failed (or newly started passing) alongside the code change that caused it, the same way a snapshot test would.

### Pins provenance

Each of the 8 adapter packages exports a `conformancePins` module (`ConformancePins`, from `@barefootjs/jsx`) — a machine-readable declaration of the diagnostics it intentionally emits for shared conformance fixtures instead of lowering them. These pins serve two consumers:

- The adapter's own conformance test (Layer 3) passes them as `expectedDiagnostics`.
- The compat engine (`packages/compat`) uses them to attach a tracking-issue URL to a matrix cell's diagnostic code.

`packages/compat/src/__tests__/compat-pins.test.ts` is the consistency gate: it replays every pinned fixture through the compat engine and asserts the pinned `{code, severity}` actually appears and that the fixture id still exists in the shared corpus. This means the compat matrix's attribution cannot silently drift from the conformance suite — a pin that goes stale in one place fails a test in the other.

Tracked limitations carry the [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation) label; that label is the source of truth for issue URLs referenced in the lockfile and matrix output.

### What NOT to test here

- **Rendered-output parity** — a `✓` cell means the component compiled cleanly against that adapter, nothing about the HTML it produces. Render identity is owned by Layer 3 (Adapter Conformance) and the eval vector corpus.
- Component structure/a11y/signals → use Component IR
- Compiler analysis internals → use Compiler Unit

---

## Decision Guide: Where to Write a Test

| Scenario | Layer | Example |
|----------|-------|---------|
| New UI component | Component IR | `ui/components/ui/my-comp/index.test.tsx` |
| New compiler transformation rule | Compiler Unit | `packages/jsx/src/__tests__/my-rule.test.ts` |
| New compiler error code | Compiler Unit | Add to existing or new error-specific test file |
| New adapter or adapter bug fix | Adapter Conformance | Add/fix fixture in `packages/adapter-tests/fixtures/` |
| New example app E2E | E2E (shared suite) | Wrapper in `integrations/*/e2e/` calling shared test function |
| New runtime primitive | Runtime Unit | `packages/dom/__tests__/my-primitive.test.ts` |
| Click/keyboard behavior | E2E | `site/ui/e2e/my-component.spec.ts` |
| Hydration bug (user reports) | Fix in compiler, verify with E2E | Root cause in `packages/jsx/`, E2E confirms fix |
| CSS class resolution | Component IR | Assert `.classes` on TestNode |
| ARIA attributes | Component IR | Assert `.aria` and `.role` on TestNode |
| Template HTML output | Adapter Conformance | Assert `expectedHtml` in fixture |
| Client JS produces correct DOM | CSR Conformance | Add fixture, verify `expectedHtml` via CSR render |
| Generated client JS format | Compiler Unit | Assert on `generateClientJs()` output |
| Does component X compile against adapter Y | Compat Lockfile | `bun run compat -- X` (or `bun run compat:lock` for the full matrix) |

### Red flags (test is in the wrong layer)

- **Compiler test checking HTML output** → Should be Adapter Conformance fixture
- **Component IR test checking generated JS code** → Should be Compiler Unit
- **E2E test verifying static structure** → Should be Component IR
- **Adapter test checking IR structure** → Should be Component IR

---

## Test File Naming

| Layer | Convention | Example |
|-------|-----------|---------|
| Compiler Unit | `<concern>.test.ts` | `expression-parser.test.ts` |
| Component IR | `index.test.tsx` in component dir | `ui/components/ui/button/index.test.tsx` |
| Adapter Conformance | `<feature>.ts` in fixtures/ | `fixtures/counter.ts` |
| Runtime Unit | `<module>.test.ts` | `reactive.test.ts` |
| E2E | `<component>.spec.ts` | `checkbox.spec.ts` |

---

## Anti-Patterns

### 1. String-matching adapter output in compiler tests

```typescript
// ❌ Couples compiler test to adapter output format
const result = compileJSX(source, { adapter: new HonoAdapter() })
expect(result.files[0].content).toContain('<button onclick={handleClick}>')

// ✅ Test IR structure instead (adapter-independent)
const result = renderToTest(source, 'test.tsx')
const button = result.find({ tag: 'button' })
expect(button!.events).toContain('click')
```

### 2. Testing HTML output without a fixture

```typescript
// ❌ Ad-hoc HTML assertion in compiler test
expect(html).toContain('<div class="active">')

// ✅ Use adapter conformance fixture for HTML assertions
export const fixture = createFixture({
  id: 'conditional-class',
  source: `...`,
  expectedHtml: `<div bf-s="test" class="active">...</div>`,
})
```

### 3. E2E test for static structure

```typescript
// ❌ E2E test that doesn't need a browser
test('checkbox has aria role', async ({ page }) => {
  await page.goto('/components/checkbox')
  const role = await page.locator('button').getAttribute('role')
  expect(role).toBe('checkbox')
})

// ✅ Component IR test (faster, no browser needed)
const result = renderToTest(source, 'checkbox.tsx', 'Checkbox')
expect(result.find({ tag: 'button' })!.role).toBe('checkbox')
```
