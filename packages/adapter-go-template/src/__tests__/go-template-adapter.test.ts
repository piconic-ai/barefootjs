/**
 * GoTemplateAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Go-template-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { renderGoTemplateComponent, GoNotAvailableError } from '@barefootjs/go-template/test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

runAdapterConformanceTests({
  name: 'go-template',
  factory: () => new GoTemplateAdapter(),
  render: renderGoTemplateComponent,
  // `branch-self-closing` no longer needs a skip — the conditional-
  // marker divergence (Hono `bf-c="sN"` attribute vs Go
  // `<!--bf-cond-start:sN-->` / `<!--bf-cond-end:sN-->` comment pairs)
  // is now collapsed by `normalizeHTML` in adapter-tests (#1266).
  //
  // `return-map` uses a `data-key` serialisation shape that differs
  // between Hono (runtime helper) and Go (template variable) in a
  // way that isn't structural — leaving it on `skipJsx` until a
  // normaliser for the `data-key` shape lands or the fixture splits
  // into per-adapter `expectedHtml`.
  //
  // `style-object-dynamic`, `static-array-children`,
  // `static-array-from-props`, and `static-array-from-props-with-component`
  // are no longer here — they're covered by `expectedDiagnostics`
  // below, asserting that the adapter emits `BF101` / `BF103` /
  // `BF104` at build time instead of silently emitting invalid
  // template syntax (#1266).
  skipJsx: [
    'return-map',
    // #1297 fixed the harness-side IR emission gate (multi-component
    // sources now emit one `ir` file per component, and the harness
    // picks the entry-point IR). The remaining gap is adapter-side:
    // the go-template adapter has no SSR context-propagation
    // mechanism, so `<Ctx.Provider value="dark">` doesn't make
    // `useContext(Ctx)` resolve to `"dark"` at template-eval time —
    // the template emits `.Theme` against a struct that has no
    // `Theme` field. Provider SSR coverage on go-template waits on
    // that adapter feature; see #1297 follow-up.
    'context-provider',
    // #1244 stress catalog (#1326): `children={<span/>}` — the IR
    // hoists the span with `needsScope: true` so the Hono reference
    // emits `bf-s` on the inner `<span>`. The Go adapter renders the
    // span up front as a compile-time HTML fragment containing the
    // `{{bfScopeAttr .}}` action, then passes it via `template.HTML`
    // through the parent's `{{.Children}}` interpolation — but
    // `template.HTML` is marked-as-safe-output, not recursively
    // parsed, so the action survives as literal text in the rendered
    // HTML. Fixing this requires either (a) re-emitting the inner
    // span as its own named template definition the outer template
    // can pass its struct to, or (b) embedding the resolved scope ID
    // at compile time. Neither lands in this PR; the Mojo sibling
    // case is handled by routing the hoisted JSX through the same
    // `begin %>…<% end` capture as nested children (see #1326 fix).
    'children-jsx-expression',
    // #1335: fragment-wrapped form of the same shape. Now that the IR
    // unwraps `<><span/></>` into the bare-element form, the Go adapter
    // hits the identical `template.HTML` interpolation gap as
    // `children-jsx-expression` above.
    'fragment-wrapped-children-jsx-expression',
    // Shared-component multi-component fixtures (#1466). Boolean
    // attribute divergence is now collapsed by `normalizeHTML`, so
    // single-root variants (`conditional-return-*`, `form`, `portal`,
    // `reactive-props`) participate again. These two still diverge
    // because the harness's child renderer pins child `bf-s` to a
    // `test_<sN>` literal rather than `<ChildName>_<id>_<sN>`. Same
    // class of test-harness scope-id plumbing the `componentName`
    // option fixed on the Hono side. Separate follow-up.
    'toggle-shared',
    'props-reactivity-comparison',
  ],
  // Per-fixture build-time contracts for shapes the Go template
  // adapter intentionally refuses to lower. Lives here (not on the
  // shared fixtures) so adding a new adapter doesn't require touching
  // any cross-adapter file — every adapter declares its own
  // refusal set against the canonical fixture corpus.
  expectedDiagnostics: {
    // JS object literal in attribute position: `convertExpressionToGo`
    // can't lower into Go template syntax — surfaces as BF101 with an
    // @client suggestion.
    'style-object-dynamic': [{ code: 'BF101', severity: 'error' }],
    // Sibling-imported child component inside a loop body: the adapter
    // emits `{{template "X" .}}` which only resolves if the user has
    // compiled the sibling file and registered the template on the
    // same instance. BF103 makes that requirement loud. (The barefoot
    // CLI passes `siblingTemplatesRegistered: true` so CLI builds
    // suppress the diagnostic — see compileJSX `siblingTemplatesRegistered`.)
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. Same BF103 surface as
    // `static-array-children` above — pinned at adapter level so the
    // shared-component corpus stays adapter-neutral.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // Array-destructure loop param (`([k, v]) => ...`): Go's `{{range
    // $a, $b := ...}}` only supports single-name bindings, so the
    // adapter would otherwise emit invalid template syntax.
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Same destructure shape with a child component body — fires both
    // BF103 (imported child in loop) and BF104 (destructure param).
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // #1244 stress catalog: same `convertExpressionToGo` refusal shape
    // as `style-object-dynamic` above — a JS object literal in
    // attribute position can't lower into Go template syntax, so the
    // adapter surfaces BF101 instead of emitting invalid template.
    'style-3-signals': [{ code: 'BF101', severity: 'error' }],
    // #1244 stress catalog: tagged-template-literal callees
    // (`cn\`base \${tone()}\``) likewise can't lower into Go template
    // syntax — same BF101 refusal.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #1310: rest destructure in .map() callback. Hono / CSR lower
    // these via the inline residual-object accessor (#1309), but the
    // Go template adapter has no analogous lowering — `paramBindings`
    // is non-empty so the generic destructure-refusal at
    // `go-template-adapter.ts` fires BF104 regardless of whether the
    // binding is rest or plain. Pinning the contract here makes the
    // limitation declarative: when the Go adapter grows a native
    // rest-lowering, dropping these entries flips the contract on.
    'rest-destructure-object-in-map': [{ code: 'BF104', severity: 'error' }],
    // #1244 catalog: rest spread back onto the root element. Same
    // refusal shape as the read-only variant above — `paramBindings`
    // is non-empty so BF104 fires regardless of how `rest` is used.
    'rest-destructure-object-spread-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
    // #1443: `[a, b].filter(Boolean).join(' ')` (registry Slot) now
    // lowers to `bf_join (bf_filter_truthy (bf_arr ...)) " "`. No
    // BF101 expected — pinned positively by the
    // `branch-local-filter-join-go` template-output test below.
    //
    // #1448 Tier A — JS Array / String methods that the Go template
    // adapter hasn't lowered yet. Each row drops once the
    // corresponding method PR lands. Hono / CSR pass these out of
    // the box (they evaluate JS at runtime) so the pin only applies
    // here.
    //
    // `array-includes` / `string-includes` no longer pinned — both
    // shapes lower via the shared `array-method` IR + the polymorphic
    // `bf_includes` runtime helper that dispatches on
    // `reflect.Kind()` (slice/array → element search, string →
    // substring search). The condition-position lowering picks up
    // the same emit through the `array-method` arm of
    // `renderConditionExpr` (#1448 Tier A first PR).
    //
    // Remaining fixtures land at expression position and surface BF101
    // via `convertExpressionToGo`. Distinct codes for the two paths is
    // pre-existing adapter behaviour, not something this catalog
    // should paper over — pinned literally here.
    // `array-indexOf` / `array-lastIndexOf` no longer pinned —
    // value-equality `bf_index_of` / `bf_last_index_of` Go runtime
    // helpers handle the shape (#1448 Tier A second PR).
    // `array-at` no longer pinned — the pre-existing `bf_at` runtime
    // helper now lowers `.at(i)` (#1448 Tier A third PR).
    // `array-concat` no longer pinned — the new `bf_concat` runtime
    // helper merges two arrays into a single `[]any` (#1448 Tier A
    // fourth PR).
    // `array-slice` no longer pinned — the new `bf_slice` runtime
    // helper carves out a sub-range with JS-compat clamping
    // (#1448 Tier A fifth PR).
    // `array-reverse` / `array-toReversed` no longer pinned —
    // both share the `bf_reverse` helper since SSR templates
    // render a snapshot and the JS mutate-vs-new distinction has
    // no template-level meaning (#1448 Tier A sixth PR).
    // `string-toLowerCase` / `string-toUpperCase` no longer pinned —
    // pre-existing `bf_lower` / `bf_upper` runtime helpers wire to
    // the JS method names at the adapter layer (#1448 Tier A
    // seventh + eighth PRs).
    // `string-trim` no longer pinned — pre-existing `bf_trim`
    // (wraps `strings.TrimSpace`) handles the strip (#1448 Tier A
    // ninth PR, closing out Tier A).
  },
  // `JSON_STRINGIFY_VIA_CONST` and `MATH_FLOOR_VIA_CONST` now pass
  // via `GoTemplateAdapter.templatePrimitives` (#1188). The two
  // remaining cases stay skipped because the V1 registry is
  // identifier-path-only and explicit:
  //   - `USER_IMPORT_VIA_CONST` — a bespoke user import isn't in
  //     the registry and can't be rendered server-side without
  //     user-supplied template-fn mappings.
  //   - `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` — uses `customSerialize`
  //     too, same reason.
  // Adding new entries to `templatePrimitives` should narrow this
  // skip set; see `templatePrimitives` declaration in
  // `go-template-adapter.ts` for the full V1 surface.
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  skipMarkerConformance: new Set<string>([
    // Same as Hono / Mojo: `/* @client */` markers on TodoApp's keyed
    // `.map` intentionally elide a slot id from the SSR template that
    // the IR still declares (s6). See hono-adapter.test for the
    // contract.
    'todo-app',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof GoNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compile JSX source to ComponentIR using the GoTemplateAdapter.
 */
function compileToIR(source: string, adapter?: GoTemplateAdapter): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new GoTemplateAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

/**
 * Compile JSX source and return the generated template output.
 */
function compileAndGenerate(source: string, adapter?: GoTemplateAdapter) {
  const a = adapter ?? new GoTemplateAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

// =============================================================================
// Go-Template-Specific Tests
// =============================================================================

describe('GoTemplateAdapter - Adapter Specific', () => {
  describe('generate - Go struct types', () => {
    test('deduplicates struct field when signal name matches prop name (#461)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Example(props: { label?: string }) {
  const [label, setLabel] = createSignal(props.label ?? 'Default')
  return <div>{label()}</div>
}
`)
      const result = adapter.generate(ir)

      expect(result.types).toBeDefined()
      // Should have exactly one Label field, not two
      const labelFields = result.types!.match(/\bLabel\b.*`json:"label"`/g) ?? []
      expect(labelFields.length).toBe(1)

      // NewExampleProps should have exactly one Label assignment
      const labelAssignments = result.types!.match(/Label:/g) ?? []
      expect(labelAssignments.length).toBe(1)
    })

    test('generates Go struct types', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return <div>{count()}</div>
}
`)
      const result = adapter.generate(ir)

      expect(result.types).toBeDefined()
      expect(result.types).toContain('package components')
      expect(result.types).toContain('type CounterProps struct')
      expect(result.types).toContain('ScopeID string')
      expect(result.types).toContain('Initial int')
      expect(result.types).toContain('Count int')
    })

    test('dynamic loop with child component → NewXxxProps carries a populate-this-slice doc comment (#1442 echo TodoApp repro)', () => {
      // Regression: a `todos().map(t => <TodoItem todo={t} />)` loop with a
      // dynamic array (signal getter, not a static prop) declares
      // `TodoItems []TodoItemProps` on the Props struct, but
      // `NewTodoAppProps` returned it empty — and the SSR template
      // iterated over the empty slice into a blank list with no signal
      // anywhere. The "you must populate this in your handler" rule was
      // pure tribal knowledge.
      //
      // Now `NewXxxProps`'s doc comment carries a concrete example for
      // every dynamic loop child, including the field name, the child's
      // Input/Props names, and the slot id needed for bf-h / bf-m.
      // Authors land on the comment as soon as they read the generated
      // file and see exactly what to do.
      const adapter = new GoTemplateAdapter()
      const todoItemIR = compileToIR(`
"use client"
type Todo = { id: number; text: string; done: boolean }
export function TodoItem(props: { todo: Todo }) {
  return <li>{props.todo.text}</li>
}
`)
      // Sanity: TodoItem alone produces a Props struct; no dynamic loop
      // inside it, so no extra comment.
      const todoItemResult = adapter.generate(todoItemIR)
      expect(todoItemResult.types).not.toContain('NOTE: `')

      const todoAppIR = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
import { TodoItem } from './TodoItem'

type Todo = { id: number; text: string; done: boolean }

export function TodoApp(props: { initial?: Todo[] }) {
  const [todos, setTodos] = createSignal<Todo[]>(props.initial ?? [])
  return (
    <ul>
      {todos().map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}
`)
      const result = adapter.generate(todoAppIR)
      // Doc-comment carries the per-child concrete example, naming the
      // populated field, the child's Input/Props types, and the bf-h /
      // bf-m wiring the SSR template relies on.
      expect(result.types).toContain('NOTE: `TodoItems`')
      expect(result.types).toContain('props.TodoItems = make([]TodoItemProps, len(items))')
      expect(result.types).toContain('NewTodoItemProps(TodoItemInput{')
      expect(result.types).toContain('props.TodoItems[i].BfParent = props.ScopeID')
      expect(result.types).toContain('props.TodoItems[i].BfMount =')
    })

    test('signal initialized via `(props.X ?? []).length` lands as int, not []T (#1442 echo TodoApp repro)', () => {
      // Regression: `extractPropNameFromInitialValue` greedily matched
      // any `(props.X ?? Y).<something>` shape and propagated the prop's
      // Go type ([]Todo) to the signal field, even when the trailing
      // accessor (`.length`) transformed the expression to a number.
      // The signal was `Seq []Todo` instead of `Seq int`, which is
      // technically a Go compile error if the field is consumed
      // arithmetically — runtime behaviour was a silent wrong-type
      // initialisation.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"

type Todo = { id: number; text: string; done: boolean }

export function TodoApp(props: { initial?: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.initial ?? [])
  const [seq] = createSignal((props.initial ?? []).length)
  const remaining = createMemo(() => todos().filter(t => !t.done).length)
  const total = createMemo(() => todos().length)
  return <div>{seq()} {remaining()} / {total()}</div>
}
`)
      const result = adapter.generate(ir)
      // Signal seeded from `.length` of an array → number → Go int.
      expect(result.types).toContain('Seq int')
      // Memos whose body is a `.length` chain → also int (analyzer
      // now runs inferTypeFromValue on the arrow body for memos).
      expect(result.types).toContain('Remaining int')
      expect(result.types).toContain('Total int')
      // Underlying prop / array signal still uses the array type.
      expect(result.types).toContain('Initial []Todo')
      expect(result.types).toContain('Todos []Todo')
      // The misclassified shapes from the original repro must not
      // resurface — even as `interface{}` (the fallback before the
      // analyzer recognised `.length`).
      expect(result.types).not.toContain('Seq []Todo')
      expect(result.types).not.toContain('Remaining interface{}')
      expect(result.types).not.toContain('Total interface{}')
    })

    test('hoists signal-time `props.X ?? N` fallback into shared local var (#1423)', () => {
      // Mirrors the Mojo manifest-defaults coverage (#1419): when the
      // signal default lives on a `??` against a bare prop access, the
      // generator hoists the fallback so the signal, the prop field,
      // and any derived memo share one fallback-applied value.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 99)
  const doubled = createMemo(() => count() * 2)
  return <div>{count()} {doubled()}</div>
}
`)
      const result = adapter.generate(ir)
      expect(result.types).toBeDefined()
      const types = result.types!

      // Hoist: `initial := in.Initial` + zero-check + fallback assign.
      expect(types).toContain('initial := in.Initial')
      expect(types).toMatch(/if initial == 0 \{\s*initial = 99\s*\}/)

      // Prop, signal, and memo all reference the hoisted variable.
      expect(types).toContain('Initial: initial,')
      expect(types).toContain('Count: initial,')
      expect(types).toContain('Doubled: initial * 2,')

      // Pre-fix output is no longer present.
      expect(types).not.toContain('Count: in.Initial,')
      expect(types).not.toContain('Doubled: in.Initial * 2,')
    })

    test('zero-fallback (`??  0`) leaves NewXxxProps unchanged (#1423)', () => {
      // The hoist is a no-op when the fallback is the Go zero value;
      // emitting `if initial == 0 { initial = 0 }` would be noise.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return <div>{count()}</div>
}
`)
      const result = adapter.generate(ir)
      const types = result.types!
      expect(types).not.toContain('initial := in.Initial')
      expect(types).toContain('Initial: in.Initial,')
      expect(types).toContain('Count: in.Initial,')
    })

    test('hoists string fallback for `props.X ?? "default"` (#1423)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Label(props: { label?: string }) {
  const [text, setText] = createSignal(props.label ?? 'Default')
  return <div>{text()}</div>
}
`)
      const result = adapter.generate(ir)
      const types = result.types!
      expect(types).toContain('label := in.Label')
      expect(types).toMatch(/if label == ""\s*\{\s*label = "Default"\s*\}/)
      expect(types).toContain('Label: label,')
      // Signal name `text` differs from prop name `label`, so the
      // signal field gets its own entry that resolves through the
      // hoisted var.
      expect(types).toContain('Text: label,')
    })

    test('hoists `props.X ?? true` against the bool zero (#1423 review)', () => {
      // Bool-true falls through the same hoist path as int / string —
      // the asymmetry is documented (caller can't thread "explicit
      // false" through because Go's bool zero IS false), but emitting
      // a hoisted local matches the int case's shape so a derived
      // memo can inherit it.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Check(props: { checked?: boolean }) {
  const [c, setC] = createSignal(props.checked ?? true)
  return <div>{c() ? 'on' : 'off'}</div>
}
`)
      const result = adapter.generate(ir)
      const types = result.types!
      expect(types).toContain('checked := in.Checked')
      expect(types).toMatch(/if checked == false\s*\{\s*checked = true\s*\}/)
      expect(types).toContain('Checked: checked,')
      expect(types).toContain('C: checked,')
    })

    test('skips hoist for zero-equivalent string and float fallbacks (#1423 review)', () => {
      // The skip predicate compares the Go fallback against the
      // type's zero literal — covers `?? ''` (string) and `?? 0.0`
      // (numeric spelling that parses to zero), not just the bare
      // `?? 0` / `?? false` literals.
      const adapter = new GoTemplateAdapter()
      const emptyStringIr = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Label(props: { label?: string }) {
  const [text, setText] = createSignal(props.label ?? '')
  return <div>{text()}</div>
}
`)
      const emptyStringTypes = adapter.generate(emptyStringIr).types!
      expect(emptyStringTypes).not.toContain('label := in.Label')
      expect(emptyStringTypes).toContain('Label: in.Label,')

      const floatIr = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Score(props: { value?: number }) {
  const [v, setV] = createSignal(props.value ?? 0.0)
  return <div>{v()}</div>
}
`)
      const floatTypes = adapter.generate(floatIr).types!
      expect(floatTypes).not.toContain('value := in.Value')
      expect(floatTypes).toContain('Value: in.Value,')
    })
  })

  describe('JSX children forwarding (#1203)', () => {
    test('forwards element children via Children: template.HTML(...)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
'use client'
import { createSignal } from "@barefootjs/client"

export function Page() {
  const [x] = createSignal(0)
  return (
    <main data-x={x()}>
      <Card>
        <span>hello</span>
        <span>world</span>
      </Card>
    </main>
  )
}
`)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('"html/template"')
      expect(types).toContain(
        'Children: template.HTML("<span>hello</span><span>world</span>")',
      )
    })

    test('text-only children stay on the plain string path (#461 carry-over)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
'use client'
import { createSignal } from "@barefootjs/client"

export function Page() {
  const [x] = createSignal(0)
  return <main data-x={x()}><Button>+1</Button></main>
}
`)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('Children: "+1"')
      expect(types).not.toContain('template.HTML')
      expect(types).not.toContain('"html/template"')
    })

    test('omits Children entry when component has no JSX children', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
'use client'
import { createSignal } from "@barefootjs/client"

export function Page() {
  const [x] = createSignal(0)
  return <main data-x={x()}><Card label="x" /></main>
}
`)
      const types = adapter.generateTypes(ir)!
      expect(types).not.toContain('Children:')
      expect(types).not.toContain('template.HTML')
    })

    test('drops dynamic children that would emit Go template actions', () => {
      // V1 limitation: a `template.HTML` value isn't re-parsed by the
      // parent's `{{.Children}}` pipeline, so any `{{...}}` inside the
      // rendered fragment would output literally. Dynamic-expression /
      // nested-component / conditional children stay on the existing
      // drop path (same as before this issue) until a re-evaluation
      // hook lands.
      const cases = [
        // signal expression inside child
        `'use client'
import { createSignal } from "@barefootjs/client"
export function Page() {
  const [c] = createSignal(0)
  return <main><Card><span>{c()}</span></Card></main>
}`,
        // nested component child
        `'use client'
import { createSignal } from "@barefootjs/client"
export function Page() {
  const [x] = createSignal(0)
  return <main data-x={x()}><Card><Button/></Card></main>
}`,
        // conditional child
        `'use client'
import { createSignal } from "@barefootjs/client"
export function Page() {
  const [v] = createSignal(true)
  return <main><Card>{v() ? <span>a</span> : <span>b</span>}</Card></main>
}`,
      ]
      for (const src of cases) {
        const adapter = new GoTemplateAdapter()
        const ir = compileToIR(src, adapter)
        const types = adapter.generateTypes(ir)!
        expect(types).not.toContain('Children:')
        expect(types).not.toContain('template.HTML')
      }
    })
  })

  describe('generateTypes', () => {
    test('generates types with custom package name', () => {
      const customAdapter = new GoTemplateAdapter({ packageName: 'views' })
      const ir = compileToIR(`
export function Button(props: { label: string }) {
  return <button>{props.label}</button>
}
`, customAdapter)

      const types = customAdapter.generateTypes(ir)

      expect(types).toContain('package views')
      expect(types).toContain('type ButtonProps struct')
      expect(types).toContain('Label string')
    })

    test('generates fields for multiple static child components with slotId', () => {
      const adapter = new GoTemplateAdapter()
      // ReactiveChild is not defined here — only referenced as a child component.
      // The compiler creates IRComponent nodes for any PascalCase JSX element.
      const ir = compileToIR(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"

export default function ReactiveProps() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)
  return (
    <div>
      <ReactiveChild value={count()} label="Child A" />
      <ReactiveChild value={doubled()} label="Child B (doubled)" />
    </div>
  )
}
`)

      const types = adapter.generateTypes(ir)!

      // Two ReactiveChild instances should produce two distinct Props fields
      const fieldMatches = types.match(/ReactiveChild\w+ ReactiveChildProps/g) ?? []
      expect(fieldMatches.length).toBe(2)

      // Each instance should have a NewReactiveChildProps initializer
      const initMatches = types.match(/NewReactiveChildProps\(ReactiveChildInput\{/g) ?? []
      expect(initMatches.length).toBe(2)

      // Each should have its own ScopeID derived from parent
      const scopeMatches = types.match(/ScopeID: scopeID \+ "_/g) ?? []
      expect(scopeMatches.length).toBe(2)

      // Label values should be present
      expect(types).toContain('Label: "Child A"')
      expect(types).toContain('Label: "Child B (doubled)"')
    })
  })

  describe('Portal component handling', () => {
    test('renders Portal component with children as portal collection', () => {
      // Portal is referenced as a child component (not defined in file).
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <Portal>
        <div data-slot="dialog-overlay"></div>
      </Portal>
    </div>
  )
}
`)
      expect(result.template).toContain('.Portals.Add')
      expect(result.template).toContain('data-slot=\\"dialog-overlay\\"')
    })

    test('renders Portal with dynamic attribute in children', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <Portal>
        <div data-slot="dialog-overlay" data-state={open() ? 'open' : 'closed'}></div>
      </Portal>
    </div>
  )
}
`)
      expect(result.template).toContain('.Portals.Add')
      expect(result.template).toContain('bfPortalHTML')
      expect(result.template).toContain('data-state')
    })

    test('Portal without children renders empty portal add', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <Portal />
    </div>
  )
}
`)
      expect(result.template).toContain('.Portals.Add')
    })

    test('non-Portal component renders normally', () => {
      // DialogTrigger is referenced but not defined — compiler creates IRComponent.
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <DialogTrigger />
    </div>
  )
}
`)
      expect(result.template).toContain('{{template "DialogTrigger"')
      expect(result.template).not.toContain('.Portals.Add')
    })
  })

  describe('block body filter rendering', () => {
    test('renders loop with simple block body filter', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  return (
    <ul>
      {todos().filter(t => { return !t.done }).map(todo => (
        <li>Item</li>
      ))}
    </ul>
  )
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('not .Done')
      expect(result.template).toContain('Item')
    })

    test('renders loop with variable declaration and simple if', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [filter, setFilter] = createSignal('all')
  return (
    <ul>
      {todos().filter(t => {
        const f = filter()
        if (f === 'active') return !t.done
        return true
      }).map(todo => (
        <li>TodoItem</li>
      ))}
    </ul>
  )
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('{{if')
      expect(result.template).toContain('$.Filter')
      expect(result.template).toContain('TodoItem')
    })

    test('renders loop with TodoApp filter pattern', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoApp() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [filter, setFilter] = createSignal('all')
  return (
    <ul>
      {todos().filter(t => {
        const f = filter()
        if (f === 'active') return !t.done
        if (f === 'completed') return t.done
        return true
      }).map(todo => (
        <li>TodoItem</li>
      ))}
    </ul>
  )
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('{{if')
      expect(result.template).toContain('$.Filter')
      expect(result.template).toContain('active')
      expect(result.template).toContain('completed')
      expect(result.template).toContain('TodoItem')
    })

    test('loop-param member access stays scoped to range dot (#1442 echo TodoApp repro)', () => {
      // Regression: `todo.done` inside `{{range $_, $todo := .Todos}}`
      // used to lower to `.Todo.Done` (a non-existent field) instead of
      // `.Done` (the range dot's field). The bug only surfaced through
      // the condition-expression rendering path — boolean attributes
      // (`checked={todo.done}`) and `style` ternaries (`todo.done ? ...`)
      // both route through `renderConditionExpr`, which had its own
      // member-handling path that skipped the loop-param normalization
      // applied by the main `ParsedExprEmitter`. Result was a silent
      // failure: Go's html/template expanded the bogus field to "" and
      // aborted the surrounding `{{if}}`, Echo returned HTTP 200 with a
      // truncated body, and the user saw a blank list with no console
      // signal.
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { id: number; text: string; done: boolean }

export function TodoApp() {
  const [todos] = createSignal<Todo[]>([])
  return (
    <ul>
      {todos().map(todo => (
        <li key={todo.id}>
          <input type="checkbox" checked={todo.done} />
          <span style={todo.done ? 'text-decoration: line-through' : ''}>{todo.text}</span>
        </li>
      ))}
    </ul>
  )
}
`)
      // The range form is unchanged — still `{{range $_, $todo := .Todos}}`.
      expect(result.template).toContain('{{range $_, $todo := .Todos}}')
      // Boolean attribute condition: `.Done`, NOT `.Todo.Done`.
      expect(result.template).toContain('{{if .Done}}checked{{end}}')
      expect(result.template).not.toContain('.Todo.Done')
      // Ternary inside `style="..."` uses the same condition path —
      // also `.Done`.
      expect(result.template).toContain('{{if .Done}}text-decoration: line-through')
    })
  })

  describe('higher-order methods - regression', () => {
    test('simple every(t => t.done) uses bf_every', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoStatus() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  return <div>{todos().every(t => t.done)}</div>
}
`)
      expect(result.template).toContain('bf_every .Todos "Done"')
    })

    test('nested .filter(...).length in filter predicate lowers via len (bf_filter ...) (#1443 PR4)', () => {
      // Pre-#1443 PR4: `renderFilterExpr` fell through to the
      // `default` arm for the inner `.filter()` and pushed BF101.
      // PR4 reuses the top-level `renderFilterLengthExpr` path
      // (`len (bf_filter <arr> "<field>" <value>)`) inside the filter
      // predicate emitter, wrapped in parens so the outer `gt` /
      // `eq` / etc. parses as a single operand. The canonical
      // "tags has at least one active" shape now renders cleanly.
      const adapter = new GoTemplateAdapter()
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { id: number; name: string; tags: { active: boolean }[] }

export function TodoList() {
  const [items, setItems] = createSignal<Todo[]>([])
  return (
    <ul>
      {items().filter(x => x.tags.filter(t => t.active).length > 0).map(t => (
        <li key={t.id}>{t.name}</li>
      ))}
    </ul>
  )
}
`, adapter)
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      expect(result.template).toContain('gt (len (bf_filter .Tags "Active" true)) 0')
      // No degenerate fallbacks
      expect(result.template).not.toContain('{{if false}}')
      expect(result.template).not.toContain('[UNSUPPORTED-FILTER-EXPR]')
      expect(result.template).not.toContain('false.Length')
    })

    test('state does not bleed between two nested-filter expressions in the same component', () => {
      // Both filters now lower (one nested + one supported). Pin
      // both to make sure the depth-scoped state reset
      // (`filterExprUnsupported`) doesn't accidentally smother a
      // sibling predicate when a transient default-arm hit DOES
      // occur (e.g. for the still-unsupported `flatMap` / `reduce`
      // shapes elsewhere in the same component).
      const adapter = new GoTemplateAdapter()
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { id: number; name: string; done: boolean; tags: { active: boolean }[] }

export function TodoList() {
  const [items, setItems] = createSignal<Todo[]>([])
  return (
    <div>
      <ul>{items().filter(x => x.tags.filter(t => t.active).length > 0).map(t => <li key={t.id}>{t.name}</li>)}</ul>
      <ul>{items().filter(t => !t.done).map(t => <li key={t.id}>{t.name}</li>)}</ul>
    </div>
  )
}
`, adapter)
      expect(result.template).toContain('gt (len (bf_filter .Tags "Active" true)) 0')
      expect(result.template).toContain('{{if not .Done}}')
    })

    test('nested higher-order in filter predicate + /* @client */ suppresses BF101', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { id: number; name: string; tags: { active: boolean }[] }

export function TodoList() {
  const [items, setItems] = createSignal<Todo[]>([])
  return (
    <ul>
      {/* @client */ items().filter(x => x.tags.filter(t => t.active).length > 0).map(t => (
        <li key={t.id}>{t.name}</li>
      ))}
    </ul>
  )
}
`, adapter)
      adapter.generate(ir)
      const bf101 = adapter.errors.filter(e => e.code === 'BF101')
      expect(bf101).toEqual([])
    })
  })

  describe('find/findIndex - adapter specific', () => {
    test('renders find() with equality + comparison mixed predicate', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; category: string }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  const [type, setType] = createSignal('')
  return <div>{items().find(t => t.price > 100 && t.category === type())}</div>
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('gt .Price 100')
      expect(result.template).toContain('eq .Category $.Type')
      expect(result.template).toContain('{{break}}')
    })

    test('renders find() in condition', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { name: string; done: boolean }

export function ItemChecker() {
  const [items, setItems] = createSignal<Item[]>([])
  return <div>{items().find(t => t.done) ? 'Found' : 'Not found'}</div>
}
`)
      expect(result.template).toContain('bf_find .Items "Done" true')
      expect(result.template).toContain('Found')
    })
  })

  describe('findLast/findLastIndex - adapter specific', () => {
    test('renders findLast() with equality predicate via bf_find_last', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { name: string; done: boolean }

export function ItemChecker() {
  const [items, setItems] = createSignal<Item[]>([])
  return <div>{items().findLast(t => t.done) ? 'Found' : 'Not found'}</div>
}
`)
      expect(result.template).toContain('bf_find_last .Items "Done" true')
      expect(result.template).toContain('Found')
    })

    test('renders findLast() with complex predicate via range without break', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; category: string }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  const [type, setType] = createSignal('')
  return <div>{items().findLast(t => t.price > 100 && t.category === type())}</div>
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('$bf_r')
      expect(result.template).not.toContain('{{break}}')
    })

    test('renders findLastIndex() with equality predicate via bf_find_last_index', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { name: string; done: boolean }

export function ItemChecker() {
  const [items, setItems] = createSignal<Item[]>([])
  return <div>idx: {items().findLastIndex(t => t.done)}</div>
}
`)
      expect(result.template).toContain('bf_find_last_index .Items "Done" true')
    })

    test('renders findLastIndex() with complex predicate via range', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; active: boolean }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  return <div>{items().findLastIndex(t => t.price > 50 && t.active)}</div>
}
`)
      const varMatch = result.template.match(/(\$bf_r\d+) := -1/)
      expect(varMatch).not.toBeNull()
      expect(result.template).toContain(`${varMatch![1]} = $i`)
      expect(result.template).not.toContain('{{break}}')
    })

    test('findLast() complex predicate in IR-level ternary works via preamble splitting', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; category: string }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  const [type, setType] = createSignal('')
  return <div>{items().findLast(t => t.price > 100 && t.category === type()) ? 'yes' : 'no'}</div>
}
`, adapter)
      const output = adapter.generate(ir)
      expect(adapter.errors.filter(e => e.code === 'BF101')).toEqual([])
      expect(output.template).toMatch(/\$bf_r\d+ := ""/)
      expect(output.template).toContain('yes')
    })

    test('findLast() complex predicate in binary expression compiles via preamble hoisting', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; category: string }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  const [type, setType] = createSignal('')
  return <div class={items().findLast(t => t.price > 100 && t.category === type()) === 'special' ? 'highlight' : 'normal'}>test</div>
}
`, adapter)
      const output = adapter.generate(ir)
      expect(adapter.errors.filter(e => e.code === 'BF101')).toEqual([])
      expect(output.template).toMatch(/\$bf_r\d+ := ""/)
      expect(output.template).toContain('eq')
      expect(output.template).toContain('"special"')
    })
  })

  describe('component root scope comment propagation', () => {
    test('component root in client component outputs bfScopeComment', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Wrapper() {
  const [active, setActive] = createSignal(false)
  return <Badge active={active()} />
}
`)
      // Component root should have scope comment for hydration boundary
      expect(result.template).toContain('{{bfScopeComment .}}')
      expect(result.template).toContain('{{template "Badge"')
    })

    test('element root in client component does NOT output bfScopeComment', () => {
      // Element roots use bf-s attribute directly, not scope comments
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`)
      expect(result.template).not.toContain('{{bfScopeComment .}}')
      expect(result.template).toContain('<div')
    })

    test('if-statement root with component branches outputs bfScopeComment', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function ConditionalComponent(props: { variant: string }) {
  const [active, setActive] = createSignal(false)
  if (props.variant === 'primary') {
    return <PrimaryBadge active={active()} />
  }
  return <DefaultBadge active={active()} />
}
`)
      // Both branches should have scope comments
      const template = result.template
      const scopeCommentCount = (template.match(/\{\{bfScopeComment \.\}\}/g) ?? []).length
      expect(scopeCommentCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('script registration - asset paths', () => {
    const source = `
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`

    test('defaults to /static/client/', () => {
      const result = compileAndGenerate(source)
      expect(result.template).toContain('{{.Scripts.Register "/static/client/barefoot.js"}}')
      expect(result.template).toContain('{{.Scripts.Register "/static/client/Counter.client.js"}}')
    })

    test('honors clientJsBasePath and barefootJsPath options', () => {
      const adapter = new GoTemplateAdapter({
        clientJsBasePath: '/examples/echo/client/',
        barefootJsPath: '/examples/echo/client/barefoot.js',
      })
      const result = compileAndGenerate(source, adapter)
      expect(result.template).toContain('{{.Scripts.Register "/examples/echo/client/barefoot.js"}}')
      expect(result.template).toContain('{{.Scripts.Register "/examples/echo/client/Counter.client.js"}}')
      expect(result.template).not.toContain('/static/client/')
    })
  })

  describe('cva-style class derivation (#1177)', () => {
    // The registry <Button> uses
    //   const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
    // Make sure jsx-to-ir's const resolution + the adapter's
    // template-literal renderer agree on every piece of that.
    const variantSource = `
"use client"

const baseClasses = 'inline-flex items-center'
const variantClasses: Record<string, string> = {
  default: 'bg-primary',
  secondary: 'bg-secondary',
}

export function Tag(props: { variant?: 'default' | 'secondary'; className?: string }) {
  const classes = \`\${baseClasses} \${variantClasses[props.variant ?? 'default']} \${props.className ?? ''}\`
  return <span className={classes}>tag</span>
}
`

    test('inlines string-literal const + emits switch for Record lookup', () => {
      const result = compileAndGenerate(variantSource)
      const tpl = result.template
      // baseClasses substituted as static text:
      expect(tpl).toContain('inline-flex items-center')
      // variantClasses[...] became a Go switch with both cases:
      expect(tpl).toMatch(/\{\{if eq [^}]+ "default"\}\}bg-primary/)
      expect(tpl).toMatch(/\{\{else if eq [^}]+ "secondary"\}\}bg-secondary/)
      expect(tpl).toContain('{{end}}')
    })

    test('html-escapes UnoCSS arbitrary-value classes inside attribute values', () => {
      const escapingSource = `
"use client"

const baseClasses = '[class*="size-"]:size-4'

export function Tagged(props: { className?: string }) {
  const classes = \`\${baseClasses} \${props.className ?? ''}\`
  return <span className={classes}>x</span>
}
`
      const tpl = compileAndGenerate(escapingSource).template
      // The literal `"` in `[class*="size-"]` would otherwise terminate
      // the wrapping attribute. Must be entity-escaped.
      expect(tpl).toContain('[class*=&quot;size-&quot;]:size-4')
      // And no raw `"` should appear inside the class= value (any
      // remaining `"` must be an attribute boundary, not literal).
      const classAttrMatch = tpl.match(/class="([^"]*)/)
      expect(classAttrMatch).not.toBeNull()
      expect(classAttrMatch![1]).not.toContain('"')
    })
  })

  describe('templatePrimitives — JS-compat callees (#1188)', () => {
    // The registry fires when the call appears DIRECTLY in a JSX
    // expression position (`<div data-x={JSON.stringify(...)}>`).
    // Chained-const usage (`const j = JSON.stringify(...); <div
    // data-x={j}>`) routes through the Go adapter's struct-field
    // lift today and doesn't invoke the registry — that's a
    // separate limitation not addressed here. The conformance
    // test for the via-const shape inspects the CLIENT JS, where
    // the call IS inlined (relocate accepts it via the registry's
    // boolean-acceptance side).

    test('JSON.stringify(props.x) emits bf_json in SSR template (inline)', () => {
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { config: object }) {
          return <div data-config={JSON.stringify(props.config)}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_json .Config')
      // No raw JS leaked into the Go template.
      expect(result.template).not.toContain('JSON.stringify')
    })

    test('Math.floor(props.score) emits bf_floor in SSR template (inline)', () => {
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { score: number }) {
          return <div data-rounded={Math.floor(props.score)}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_floor .Score')
      expect(result.template).not.toContain('Math.floor')
    })

    test('Math.ceil / Math.round both map to their bf_* equivalents', () => {
      const ceilResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: number }) {
          return <div data-x={Math.ceil(props.v)}>hi</div>
        }
      `)
      expect(ceilResult.template).toContain('bf_ceil .V')

      const roundResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: number }) {
          return <div data-x={Math.round(props.v)}>hi</div>
        }
      `)
      expect(roundResult.template).toContain('bf_round .V')
    })

    test('String(props.x) and Number(props.x) emit bf_string / bf_number', () => {
      const stringResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: number }) {
          return <div data-x={String(props.v)}>hi</div>
        }
      `)
      expect(stringResult.template).toContain('bf_string .V')

      const numberResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: string }) {
          return <div data-x={Number(props.v)}>hi</div>
        }
      `)
      expect(numberResult.template).toContain('bf_number .V')
    })

    test('registry exposes the expected V1 callees', () => {
      // Pin the V1 surface so a future refactor doesn't accidentally
      // drop a primitive. New entries are additive — extend this
      // list rather than replace.
      const a = new GoTemplateAdapter()
      const keys = Object.keys(a.templatePrimitives ?? {}).sort()
      expect(keys).toEqual(['JSON.stringify', 'Math.ceil', 'Math.floor', 'Math.round', 'Number', 'String'])
    })

    test('unregistered identifier-path callee is NOT accepted by the registry', () => {
      // The registry is identifier-path-only and explicit. A
      // user-import like `customSerialize` is NOT registered, so
      // the Go adapter can't render it server-side. Pin so a
      // future refactor doesn't accidentally start accepting
      // arbitrary identifier-paths via this map.
      const a = new GoTemplateAdapter()
      expect(a.templatePrimitives?.['customSerialize']).toBeUndefined()
    })

    test('wrong-arity primitive call falls back to BF101 instead of emitting invalid template', () => {
      // V1 emit fns blindly read `args[0]`. The arity gate must
      // reject 0-arg / 2-arg shapes so we don't ship invalid Go
      // template syntax (`bf_json` with no operand) or silently
      // drop extra args.
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { config: object; replacer: any }) {
          return <div data-x={JSON.stringify(props.config, props.replacer)}>hi</div>
        }
      `)
      // The substituted form must NOT appear with a stray second
      // arg; the call falls through and surfaces an error
      // instead.
      expect(result.template).not.toContain('bf_json')
    })

    test('computed-member callee does NOT match a string-keyed registry path', () => {
      // `arr[0](x)` parses as a call whose callee is a
      // computed-member. `identifierPath` must return null for
      // computed members so a same-named primitive in the
      // registry can't be triggered through array indexing.
      // Pin: the substitution path doesn't fire here.
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { fns: ((x: any) => string)[]; v: any }) {
          return <div data-x={props.fns[0](props.v)}>hi</div>
        }
      `)
      expect(result.template).not.toContain('bf_json')
      expect(result.template).not.toContain('bf_string')
    })

    test('two-tier source-of-truth keeps emit + arity in sync', () => {
      // Regression for the previous parallel-map shape (#1200
      // review): ensure every `templatePrimitives` key has a
      // matching arity entry, so a registry-only addition can't
      // silently bypass the arity gate.
      const a = new GoTemplateAdapter()
      const arities = (a as unknown as { templatePrimitiveArities: Record<string, number> }).templatePrimitiveArities
      for (const key of Object.keys(a.templatePrimitives ?? {})) {
        expect(arities[key]).toBeGreaterThan(0)
      }
    })

    test('Math.floor(Number(...)) end-to-end via go run produces the expected rendered HTML', async () => {
      // The other tests assert template emission strings; this one
      // closes the loop by actually running `go run` against the
      // generated template + Go runtime helpers, so a regression in
      // the Go-side `Floor`/`Number` funcs surfaces here. Also
      // exercises chained-primitive composition (`bf_floor
      // (bf_number .Score)`) which the inline-direct emit path
      // produces for nested calls.
      //
      // The prop is typed `string` rather than `number` because
      // generateTypes maps TS `number` to Go `int`, and an `int`
      // field can't hold the fractional value we need to actually
      // exercise floor's rounding behaviour. Coercing through
      // `Number(props.score)` keeps the Go field as `string` and
      // shifts the float arithmetic into the runtime helpers.
      // Skipped on hosts without Go ≥ 1.25 (existing harness
      // GoNotAvailableError path).
      try {
        const html = await renderGoTemplateComponent({
          source: `
'use client'
export function Foo(props: { score: string }) {
  return <div data-rounded={Math.floor(Number(props.score))}>hi</div>
}
          `,
          adapter: new GoTemplateAdapter(),
          props: { score: '3.7' },
        })
        // Math.floor(Number("3.7")) === 3. Go float64 with integer
        // value formats as "3" via %v.
        expect(html).toContain('data-rounded="3"')
      } catch (err) {
        if (err instanceof GoNotAvailableError) {
          console.log('Skipping Math.floor e2e: go command not found')
          return
        }
        throw err
      }
    })

    test('JSON.stringify end-to-end via go run produces the expected rendered HTML', async () => {
      try {
        const html = await renderGoTemplateComponent({
          source: `
'use client'
export function Foo(props: { name: string }) {
  return <div data-config={JSON.stringify(props.name)}>hi</div>
}
          `,
          adapter: new GoTemplateAdapter(),
          props: { name: 'alice' },
        })
        // `JSON.stringify("alice")` → `"alice"` (with quotes).
        // The template interpolates into an attribute value, so the
        // outer quotes get HTML-entity escaped.
        expect(html).toContain('&#34;alice&#34;')
      } catch (err) {
        if (err instanceof GoNotAvailableError) {
          console.log('Skipping JSON.stringify e2e: go command not found')
          return
        }
        throw err
      }
    })
  })

  describe('NewXxxProps template-parts dispatch (#1275)', () => {
    // Companion to the Mojo / Hono unit tests for the
    // `record-index-lookup-via-child-prop` conformance fixture. The IR
    // producer collapses `template` → `expression` for component props
    // but preserves the parts on `ExpressionAttr.parts`; the Go adapter
    // must read those parts and emit an IIFE (`switch`-based) in the
    // generated `NewXxxProps` so the variant class is materialised at
    // SSR time. The previous behaviour silently dropped the prop —
    // visible end-to-end as `class=""` on the scaffold's Button.
    test('record-index-lookup via child prop emits a Go switch IIFE, not a dropped field', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  return <Slot className={\`base \${classes[variant]}\`}>hi</Slot>
}
`, adapter)
      const out = adapter.generate(ir)
      const goCode = out.types ?? ''
      // The ClassName field MUST be set on the SlotInput literal.
      expect(goCode).toContain('ClassName:')
      // The IIFE shape: a self-invoking func that switches on the
      // variant key and returns the matching case.
      expect(goCode).toContain('func() string {')
      expect(goCode).toContain('in.Variant.(string)')
      expect(goCode).toContain('case "a": return "class-a"')
      expect(goCode).toContain('case "b": return "class-b"')
    })

    test('intermediate-const composition (Button shape) carries through', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  const composed = \`base \${classes[variant]}\`
  return <Slot className={composed}>hi</Slot>
}
`, adapter)
      const out = adapter.generate(ir)
      const goCode = out.types ?? ''
      expect(goCode).toContain('ClassName:')
      expect(goCode).toContain('case "a": return "class-a"')
    })
  })

  describe('destructured / function-keyword filter shapes (#1443)', () => {
    test('.filter(({done}) => done).map(...) lowers cleanly', () => {
      // Pre-#1443 the destructured arrow rejected at the parser and the
      // surrounding `.map()` loop fell back to a BF101 path. With the
      // parser rewriting `({done}) => done` to `_t => _t.done`, the
      // adapter's existing IRLoop.filterPredicate path renders the
      // chain as `bf_filter .Items "Done" true`.
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<any[]>([])
  return <ul>{items().filter(({done}) => done).map(t => <li key={t.id}>{t.name}</li>)}</ul>
}`)
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      expect(result.template).toContain('bf_filter .Items "Done" true')
    })

    test('.filter(function (x) { return x.done }).map(...) lowers cleanly', () => {
      // Function expressions with a single `return <expr>` body
      // normalise to the arrow-fn IR shape at parse time.
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<any[]>([])
  return <ul>{items().filter(function (x) { return x.done }).map(t => <li key={t.id}>{t.name}</li>)}</ul>
}`)
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      expect(result.template).toContain('bf_filter .Items "Done" true')
    })
  })

  describe('registry Slot class-merge chain (#1443)', () => {
    test('[a, b].filter(Boolean).join(\' \') lowers to bf_join (bf_filter_truthy (bf_arr ...)) " "', () => {
      // The registry `<Slot>` merges className via
      // `[className, childClass].filter(Boolean).join(' ')`. Pre-#1443
      // each link in the chain (array literal, `Boolean` callable
      // filter, `.join`) hit a Go-side refusal gate and the chain
      // emitted BF101 — making the scaffold `<Button>` / `<Card>`
      // unusable on Go templates. The fix lowers all three:
      //
      //   - `[a, b]`              → `bf_arr a b`     (variadic helper)
      //   - `.filter(Boolean)`    → `bf_filter_truthy <arr>`
      //   - `.join(sep)`          → `bf_join <arr> <sep>`
      //
      // Composing through paren-wrapped function calls keeps Go
      // template's prefix-call precedence well-formed.
      const result = compileAndGenerate(`
"use client"
function Slot({ children, className }: { children?: unknown; className?: string }) {
  if (children) {
    const merged = [className].filter(Boolean).join(' ')
    return <div className={merged}>x</div>
  }
  return <div>fallback</div>
}
export { Slot }
`.trimStart())
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      expect(result.template).toContain('bf_join (bf_filter_truthy (bf_arr .ClassName)) " "')
    })
  })

  describe('.includes lowering (#1448 Tier A)', () => {
    test('items.includes(target) emits `bf_includes .Items .Target` in condition position', () => {
      // Pre-#1448: BF102 ("Condition not supported") because the
      // `array-method` IR variant didn't include `includes`, so
      // `isSupported` refused. Now the parser produces an
      // `array-method` node and the condition-position dispatcher
      // (`renderConditionExpr`'s `array-method` arm) delegates to
      // the same `arrayMethod` emit as expression position, so the
      // `{{if bf_includes ...}}` shape works.
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [target] = createSignal('x')
  return <div>{items().includes(target()) ? 'yes' : 'no'}</div>
}`)
      expect(result.template).toContain('{{if bf_includes .Items .Target}}')
    })

    test('value.includes(needle) emits the same bf_includes form (runtime dispatches on receiver)', () => {
      // String and array `.includes` share the parser surface; the
      // adapter emits the same `bf_includes` call and the Go
      // runtime helper inspects `reflect.Kind()` at evaluation time.
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [value] = createSignal('hello world')
  const [needle] = createSignal('world')
  return <div>{value().includes(needle()) ? 'yes' : 'no'}</div>
}`)
      expect(result.template).toContain('{{if bf_includes .Value .Needle}}')
    })
  })

  describe('.indexOf / .lastIndexOf lowering (#1448 Tier A)', () => {
    test('items.indexOf(target) emits `bf_index_of .Items .Target`', () => {
      // Pre-#1448: parser refused `.indexOf` via `UNSUPPORTED_METHODS`
      // and surfaced BF101. The new `array-method` arm + the
      // `bf_index_of` runtime helper give it value-equality semantics
      // (DeepEqual against scalars / structs), disjoint from the
      // struct-field `bf_find_index` used by `.find`.
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [target] = createSignal('x')
  return <div>idx: {items().indexOf(target())}</div>
}`)
      expect(result.template).toContain('bf_index_of .Items .Target')
      // Defensive: must not route through the struct-field helper.
      expect(result.template).not.toContain('bf_find_index')
    })

    test('items.lastIndexOf(target) emits `bf_last_index_of .Items .Target`', () => {
      // Backward-walk variant of indexOf — disambiguating the
      // duplicated-value case is the canonical reason an author
      // reaches for `.lastIndexOf` over `.indexOf`.
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [target] = createSignal('x')
  return <div>last: {items().lastIndexOf(target())}</div>
}`)
      expect(result.template).toContain('bf_last_index_of .Items .Target')
    })
  })

  describe('.at lowering (#1448 Tier A)', () => {
    test('items.at(-1) emits `bf_at .Items (bf_neg 1)` (negative-index pass-through)', () => {
      // The Go runtime's `At` already handles negative indices —
      // `bf_at .Items -1` returns the last element. Go template
      // syntax doesn't accept literal negative numbers in prefix-
      // call positions, so the adapter routes the unary minus
      // through `bf_neg`; the runtime is unchanged.
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <div>last: {items.at(-1)}</div>
}
export { A }`)
      expect(result.template).toContain('bf_at .Items (bf_neg 1)')
    })

    test('items.at(i) with a signal index emits `bf_at .Items .I`', () => {
      // Non-literal index — the inner expression goes through the
      // standard `emit(arg)` path, so any supported expression form
      // composes (signal call, prop access, arithmetic, etc.).
      const result = compileAndGenerate(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [i] = createSignal(0)
  return <div>el: {items().at(i())}</div>
}`)
      expect(result.template).toContain('bf_at .Items .I')
    })
  })

  describe('.slice lowering (#1448 Tier A)', () => {
    test('items.slice(1, 3).join(\' \') chains through bf_slice → bf_join', () => {
      // 2-arg form. The canonical Tier A fixture pins the two-arg
      // start-and-end shape since a lowering that only handled
      // single-arg `.slice(start)` would still pass `.slice(1)`
      // but fail here.
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <div>{items.slice(1, 3).join(' ')}</div>
}
export { A }`)
      expect(result.template).toContain('bf_join (bf_slice .Items 1 3) " "')
    })

    test('items.slice(start) emits the 1-arg form (no `end`)', () => {
      // 1-arg form. The Go helper's variadic `end ...int` parameter
      // distinguishes "absent" from "0"; the absent case slices to
      // length, the explicit `0` case slices to empty.
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <div>{items.slice(2).join(' ')}</div>
}
export { A }`)
      expect(result.template).toContain('bf_join (bf_slice .Items 2) " "')
    })
  })

  describe('.toLowerCase / .toUpperCase lowering (#1448 Tier A)', () => {
    test('value.toLowerCase() emits `bf_lower .Value`', () => {
      // Pre-#1448: parser refused `.toLowerCase` via
      // `UNSUPPORTED_METHODS` and surfaced BF101. The runtime's
      // `bf_lower` helper has been registered from a prior code
      // path; this PR wires the JS method name to it.
      const result = compileAndGenerate(`function A({ value }: { value: string }) {
  return <div>{value.toLowerCase()}</div>
}
export { A }`)
      expect(result.template).toContain('bf_lower .Value')
    })

    test('value.toUpperCase() emits `bf_upper .Value`', () => {
      // Mirrors toLowerCase — pre-existing `bf_upper` runtime
      // helper, JS method name wired at the adapter layer.
      const result = compileAndGenerate(`function A({ value }: { value: string }) {
  return <div>{value.toUpperCase()}</div>
}
export { A }`)
      expect(result.template).toContain('bf_upper .Value')
    })

    test('value.trim() emits `bf_trim .Value`', () => {
      // Pre-existing `bf_trim` (wraps `strings.TrimSpace`); only
      // adapter wiring is new.
      const result = compileAndGenerate(`function A({ value }: { value: string }) {
  return <div>[{value.trim()}]</div>
}
export { A }`)
      expect(result.template).toContain('bf_trim .Value')
    })
  })

  describe('.reverse / .toReversed lowering (#1448 Tier A)', () => {
    test('items.reverse().join(\' \') chains through bf_reverse → bf_join', () => {
      // `Array.prototype.reverse()` mutates the receiver in JS, but
      // in SSR template context the receiver is never observed,
      // so the helper returns a new slice. Composes with .join(' ')
      // to make the reversed order visible in the rendered output.
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <div>{items.reverse().join(' ')}</div>
}
export { A }`)
      expect(result.template).toContain('bf_join (bf_reverse .Items) " "')
    })

    test('items.toReversed().join(\' \') routes through the same helper', () => {
      // `.toReversed()` is the non-mutating sibling. Sharing a
      // lowering with `.reverse()` is fine in template context.
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <div>{items.toReversed().join(' ')}</div>
}
export { A }`)
      expect(result.template).toContain('bf_join (bf_reverse .Items) " "')
    })
  })

  describe('.concat lowering (#1448 Tier A)', () => {
    test('left.concat(right).join(\' \') chains through bf_concat → bf_join', () => {
      // Composition pin: the canonical Tier A fixture
      // (`packages/adapter-tests/fixtures/methods/array-concat.ts`)
      // composes `.concat(...).join(' ')` so the concatenation
      // result must be a real iterable (`[]any` from `bf_concat`),
      // not a stringified `[object Object]` from a wrong lowering.
      const result = compileAndGenerate(`function A({ left, right }: { left: string[]; right: string[] }) {
  return <div>{left.concat(right).join(' ')}</div>
}
export { A }`)
      expect(result.template).toContain('bf_join (bf_concat .Left .Right) " "')
    })
  })

  describe('.entries() / .keys() / .values() iteration shapes (#1448 Tier B)', () => {
    test('.entries().map(([i, v]) => ...) emits {{range $i, $v := .Items}}', () => {
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <ul>{items.entries().map(([i, v]) => <li key={i}>{i}: {v}</li>)}</ul>
}
export { A }`)
      expect(result.template).toContain('{{range $i, $v := .Items}}')
    })

    test('.keys().map(k => ...) emits {{range $k, $_ := .Items}}', () => {
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <ul>{items.keys().map(k => <li key={k}>{k}</li>)}</ul>
}
export { A }`)
      expect(result.template).toContain('{{range $k, $_ := .Items}}')
    })

    test('.values().map(v => ...) emits standard {{range $_, $v := .Items}}', () => {
      const result = compileAndGenerate(`function A({ items }: { items: string[] }) {
  return <ul>{items.values().map(v => <li key={v}>{v}</li>)}</ul>
}
export { A }`)
      expect(result.template).toContain('{{range $_, $v := .Items}}')
    })
  })
})

// =============================================================================
// #1448 Tier A — fixture-driven lowering pins
// =============================================================================
//
// Companion to the Mojo adapter's fixture-driven block (see
// `packages/adapter-mojolicious/src/__tests__/mojo-adapter.test.ts`).
// The conformance test suite above renders every fixture end-to-end
// through `go run` and compares HTML — strongest possible signal —
// but skips with `GoNotAvailableError` on hosts without Go installed.
// This block compiles each Tier A fixture's `source` through the
// adapter and pins the emitted helper-call substring directly on
// the Go template string. No `go run` needed; runs on every host.
//
// One row per Tier A method fixture from
// packages/adapter-tests/fixtures/methods/. Each PR in the Tier A
// stack appends its rows as the corresponding lowering lands.

import { fixture as arrayIncludesFixture } from '../../../adapter-tests/fixtures/methods/array-includes'
import { fixture as stringIncludesFixture } from '../../../adapter-tests/fixtures/methods/string-includes'
import { fixture as arrayIndexOfFixture } from '../../../adapter-tests/fixtures/methods/array-indexOf'
import { fixture as arrayLastIndexOfFixture } from '../../../adapter-tests/fixtures/methods/array-lastIndexOf'
import { fixture as arrayAtFixture } from '../../../adapter-tests/fixtures/methods/array-at'
import { fixture as arrayConcatFixture } from '../../../adapter-tests/fixtures/methods/array-concat'
import { fixture as arraySliceFixture } from '../../../adapter-tests/fixtures/methods/array-slice'
import { fixture as arrayReverseFixture } from '../../../adapter-tests/fixtures/methods/array-reverse'
import { fixture as arrayToReversedFixture } from '../../../adapter-tests/fixtures/methods/array-toReversed'
import { fixture as stringToLowerCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toLowerCase'
import { fixture as stringToUpperCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toUpperCase'
import { fixture as stringTrimFixture } from '../../../adapter-tests/fixtures/methods/string-trim'
// #1448 Tier B — .sort / .toSorted fixtures.
import { fixture as arraySortFieldAscFixture } from '../../../adapter-tests/fixtures/methods/array-sort-field-asc'
import { fixture as arraySortFieldDescFixture } from '../../../adapter-tests/fixtures/methods/array-sort-field-desc'
import { fixture as arraySortPrimitiveFixture } from '../../../adapter-tests/fixtures/methods/array-sort-primitive'
import { fixture as arraySortLocaleFixture } from '../../../adapter-tests/fixtures/methods/array-sort-locale'
import { fixture as arraySortMultiKeyFixture } from '../../../adapter-tests/fixtures/methods/array-sort-multikey'
import { fixture as arraySortTernaryFixture } from '../../../adapter-tests/fixtures/methods/array-sort-ternary'
import { fixture as arrayToSortedFixture } from '../../../adapter-tests/fixtures/methods/array-toSorted'
// #1448 Tier B — .entries / .keys / .values iteration shapes.
import { fixture as arrayEntriesFixture } from '../../../adapter-tests/fixtures/methods/array-entries'
import { fixture as arrayKeysFixture } from '../../../adapter-tests/fixtures/methods/array-keys'
import { fixture as arrayValuesFixture } from '../../../adapter-tests/fixtures/methods/array-values'

describe('GoTemplateAdapter - #1448 Tier A/B fixture-driven lowering pins', () => {
  const cases = [
    // The `.includes` fixtures sit at condition position
    // (`{cond ? 'yes' : 'no'}`), so the emit lands inside `{{if ...}}`.
    { fixture: arrayIncludesFixture,    expect: '{{if bf_includes .Items .Target}}' },
    { fixture: stringIncludesFixture,   expect: '{{if bf_includes .Value .Needle}}' },
    { fixture: arrayIndexOfFixture,     expect: 'bf_index_of .Items .Target' },
    { fixture: arrayLastIndexOfFixture, expect: 'bf_last_index_of .Items .Target' },
    // The literal `-1` lowers through `bf_neg 1` — Go template
    // doesn't accept literal negative numbers in prefix-call
    // positions. Pre-existing unary-emit pattern.
    { fixture: arrayAtFixture,          expect: 'bf_at .Items (bf_neg 1)' },
    { fixture: arrayConcatFixture,      expect: 'bf_concat .Left .Right' },
    { fixture: arraySliceFixture,       expect: 'bf_slice .Items 1 3' },
    { fixture: arrayReverseFixture,     expect: 'bf_reverse .Items' },
    // .toReversed shares the helper with .reverse — pinning both
    // routings catches a future divergence between them.
    { fixture: arrayToReversedFixture,  expect: 'bf_reverse .Items' },
    { fixture: stringToLowerCaseFixture,expect: 'bf_lower .Value' },
    { fixture: stringToUpperCaseFixture,expect: 'bf_upper .Value' },
    { fixture: stringTrimFixture,       expect: 'bf_trim .Value' },
    // #1448 Tier B — sort / toSorted. Loop-chained shapes wrap the
    // iterable in `bf_sort .Items <kind> <key> <type> <dir>`;
    // standalone shapes inline the helper at the call site.
    { fixture: arraySortFieldAscFixture,  expect: 'bf_sort .Items "field" "Price" "numeric" "asc"' },
    { fixture: arraySortFieldDescFixture, expect: 'bf_sort .Items "field" "Price" "numeric" "desc"' },
    { fixture: arraySortPrimitiveFixture, expect: 'bf_sort .Nums "self" "" "numeric" "asc"' },
    { fixture: arraySortLocaleFixture,    expect: 'bf_sort .Names "self" "" "string" "asc"' },
    // Multi-key (`||`-chain): one 4-string group per comparison key,
    // applied in priority order as tie-breakers.
    { fixture: arraySortMultiKeyFixture,  expect: 'bf_sort .Items "field" "Price" "numeric" "asc" "field" "Name" "string" "asc"' },
    // Relational-ternary comparator lowers to a single `auto` key.
    { fixture: arraySortTernaryFixture,   expect: 'bf_sort .Items "field" "Rank" "auto" "asc"' },
    { fixture: arrayToSortedFixture,      expect: 'bf_sort .Nums "self" "" "numeric" "asc"' },
    // #1448 Tier B — iteration shapes. These are loop-level
    // patterns (range binding order), not helper function calls.
    { fixture: arrayEntriesFixture,       expect: '{{range $i, $v := .Items}}' },
    { fixture: arrayKeysFixture,          expect: '{{range $k, $_ := .Items}}' },
    { fixture: arrayValuesFixture,        expect: '{{range $_, $v := .Items}}' },
  ]

  for (const { fixture, expect: expectedHelper } of cases) {
    test(`[${fixture.id}] lowers to \`${expectedHelper}\``, () => {
      const adapter = new GoTemplateAdapter()
      const result = compileJSX(fixture.source, `${fixture.id}.tsx`, { adapter })
      // No BF101 — the parser arm + adapter case took the call.
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      // ...and no BF102 — `.includes` lands at condition position so
      // a regression to the "Condition not supported" path would
      // surface here.
      expect(result.errors?.filter(e => e.code === 'BF102') ?? []).toEqual([])
      const template = result.files.find(f => f.path.endsWith('.tmpl'))?.content ?? ''
      expect(template).toContain(expectedHelper)
    })
  }
})
