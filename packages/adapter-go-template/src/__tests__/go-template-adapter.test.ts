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
import { compileJSX, type ComponentIR, type IRExpression } from '@barefootjs/jsx'

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
  // JSX-render skips: every other shared conformance fixture renders to
  // Hono parity on real Go — including the composed `site/ui` demo
  // corpus (#1467 / #1896): JSX children passed to imported components
  // now render through per-call-site companion defines executed via
  // `bf_tmpl` + `bf_with_children` (see the bf runtime's
  // `TemplateFuncMap`). Shapes the adapter intentionally refuses at
  // build time are pinned in `expectedDiagnostics` below.
  //
  // `data-table` — the last #1896 holdout — now renders to Hono byte
  // parity on real Go and is fully un-skipped (run in CI). Its table
  // body is a keyed `.map` over a `/* @client */`-sorted MEMO whose
  // data is a module-const object array (a memo-derived dynamic loop of
  // imported components); the nested-component slice constructor bakes
  // it via loop-body children companion defines, a wrapper struct +
  // constructor, and block-body memo folding (#1897). On Go it is
  // un-skipped everywhere — including `skipMarkerConformance` below,
  // since the SSR template emits the slot ids the IR declares.
  //
  // `search-params` (router v0.5) now renders on Go: `logical()` parenthesises
  // its multi-token operands so `searchParams().get(k) ?? d` lowers to
  // `{{or (.SearchParams.Get "sort") "none"}}`, and the generated structs carry
  // a `SearchParams bf.SearchParams` binding (zero value → empty query → the
  // author's default). See #1922; Mojo / Xslate stay skipped pending their own
  // env-signal lowering + per-request Perl reader.
  skipJsx: [],
  // Per-fixture build-time contracts for shapes the Go template
  // adapter intentionally refuses to lower. Lives here (not on the
  // shared fixtures) so adding a new adapter doesn't require touching
  // any cross-adapter file — every adapter declares its own
  // refusal set against the canonical fixture corpus.
  expectedDiagnostics: {
    // `style-object-dynamic` / `style-3-signals` no longer pinned — a
    // `style={{ … }}` object literal now lowers to a CSS string with dynamic
    // values interpolated (`background-color:{{.Color}};padding:8px`) via
    // `tryLowerStyleObject` (#1322).
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
    // (`style-3-signals` graduated alongside `style-object-dynamic` — see note
    // above; the `style={{ … }}` object now lowers to a CSS string.)
    // #1244 stress catalog: tagged-template-literal callees
    // (`cn\`base \${tone()}\``) likewise can't lower into Go template
    // syntax — same BF101 refusal.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #2038: a filter predicate whose body contains a NESTED callback call
    // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). The
    // evaluator refuses nested arrows and `renderFilterExpr` has no faithful
    // Go form for the inner call (its `call` arm used to silently drop the
    // arrow argument and render only the callee) — the compiler is loud
    // instead of lossy. The `/* @client */` twin
    // (`filter-nested-callback-predicate-client`) has no pin here: it must
    // render clean on every adapter, which asserts the suppression contract.
    // https://github.com/piconic-ai/barefootjs/issues/2038
    'filter-nested-callback-predicate': [{ code: 'BF101', severity: 'error' }],
    'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error' }],
    // #1310: rest destructure in .map() callback. The object-rest shape read
    // via member access (`rest-destructure-object-in-map`) now lowers — each
    // binding resolves to a field on a synthetic `$__bf_item0` range var (the
    // reserved `__bf_item` name, depth-suffixed) and `rest.flag` →
    // `$__bf_item0.Flag` (`destructureBindingsSupportable`). The
    // other three stay refused: rest SPREAD (`{...rest}`) needs a residual
    // object, and array-index / nested paths (`[a, ...t]`, `{ cells: [h] }`)
    // need index/slice machinery Go's `{{range}}` can't express inline.
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
    // (#1897) data-table no longer skipped — loop body children + wrapper
    // struct + block-body memo baking render correctly on Go.
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

describe('GoTemplateAdapter - searchParams() env-signal lowering (#1922)', () => {
  // `searchParams().get(k)` lowers to a method call on the canonical
  // `.SearchParams` struct field, parenthesised inside `or` so the nullish
  // fallback groups correctly.
  test('lowers searchParams().get(k) to .SearchParams.Get and emits the struct binding', () => {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
import { createSearchParams } from '@barefootjs/client'
export function SortLabel() {
  const [searchParams] = createSearchParams()
  return <p>{searchParams().get('sort') ?? 'none'}</p>
}
`, adapter)
    const { template, types } = adapter.generate(ir)
    expect(template).toContain('{{or (.SearchParams.Get "sort") "none"}}')
    expect(types).toContain('SearchParams bf.SearchParams')
    expect(types).toContain('SearchParams: in.SearchParams')
  })

  // An aliased destructured getter binds the env signal to a different local
  // name; the call `sp()` still resolves to the canonical `.SearchParams` field
  // (the generated struct field name is fixed, not derived from the JS name).
  test('aliased env-signal getter (`const [sp] = createSearchParams()`) resolves sp() to canonical .SearchParams', () => {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
import { createSearchParams } from '@barefootjs/client'
export function SortLabel() {
  const [sp] = createSearchParams()
  return <p>{sp().get('sort') ?? 'none'}</p>
}
`, adapter)
    const { template, types } = adapter.generate(ir)
    expect(template).toContain('{{or (.SearchParams.Get "sort") "none"}}')
    expect(template).not.toContain('.Sp.Get')
    expect(types).toContain('SearchParams bf.SearchParams')
  })
})

describe('GoTemplateAdapter - template-literal text lowering (#1933)', () => {
  // A dynamic text node whose expression is a template literal lowers to a
  // MIX of literal text + `{{...}}` actions (e.g. ` · #${tag}` →
  // ` · #{{.Tag}}`). `renderExpression` must emit that mixed string as-is
  // between bfTextStart/bfTextEnd — wrapping the whole thing in another
  // `{{...}}` produces `{{ · #{{.Tag}}}}`, which `html/template` rejects at
  // parse time with `unrecognized character in action: U+00B7 '·'`. This is
  // the blog PostList status-line shape (the `· #${params().tag}` branch).
  test('template literal in a conditional text branch keeps literal text outside the action', () => {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function StatusLine() {
  const [searchParams] = createSearchParams()
  const tag = createMemo(() => searchParams().get('tag') ?? '')
  return (
    <div className="status">
      {tag() ? \` · #\${tag()}\` : ''}
    </div>
  )
}
`, adapter)
    const { template } = adapter.generate(ir)
    // The literal text ` · #` must sit OUTSIDE the action, with only the
    // interpolation as `{{...}}`. The broken form double-wraps it.
    expect(template).not.toContain('{{ · #')
    expect(template).toContain(' · #{{.Tag}}')
  })

  // Generalised: a template literal with a trailing interpolation in plain
  // dynamic-text position (no conditional) must not be double-wrapped either.
  test('template literal in plain dynamic text is not double-wrapped', () => {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Label() {
  const [n, setN] = createSignal(0)
  return <span>{\`count: \${n()}\`}</span>
}
`, adapter)
    const { template } = adapter.generate(ir)
    expect(template).not.toContain('{{count: ')
    expect(template).toContain('count: {{.N}}')
  })

  // A bare string literal that merely *contains* `{{` (NOT a template literal)
  // must still be WRAPPED in an action so html/template evaluates and escapes
  // the string. Emitting the raw Go expression `"{{"` would print the literal
  // quotes and bypass escaping. The skip-wrapping path is reserved for template
  // literals + `{{`-leading action chains, so a substring `includes('{{')` check
  // would wrongly treat this string as template text (#1937 review).
  test('string literal containing "{{" is wrapped, not treated as template text', () => {
    const adapter = new GoTemplateAdapter()
    // Drive renderExpression directly: a JSX `{'{{'}` lowers `expr.expr` to the
    // Go string literal `"{{"`, which contains `{{` but is not a template expr.
    const out = adapter.renderExpression({ expr: `'{{'` } as IRExpression)
    expect(out).toBe('{{"{{"}}')
  })

  // Control: a real template literal IS emitted as-is (mixed text + action),
  // exercising the same code path with the opposite outcome.
  test('template literal expression is emitted as-is via renderExpression', () => {
    const adapter = new GoTemplateAdapter()
    const out = adapter.renderExpression({ expr: '`a #${tag}`' } as IRExpression)
    expect(out).toBe('a #{{.Tag}}')
  })

  // Attribute context: when a `${...}` interpolation lowers to a template
  // literal, its literal text sits OUTSIDE the `{{...}}` actions and so bypasses
  // html/template's attribute escaping. A `"` in a UnoCSS arbitrary value would
  // break the surrounding `class="..."`. The literal parts must be escaped while
  // interpolations stay as actions (#1937 review).
  test('attribute-context template-literal interpolation escapes its literal text', () => {
    const adapter = new GoTemplateAdapter()
    const out = (adapter as unknown as {
      substituteJsInterpolations(s: string): string
    }).substituteJsInterpolations('content-["x"] ${`a-["y"] ${tag}`} z')
    // The `"` from the nested template literal's literal part is escaped, not raw.
    expect(out).toContain('a-[&quot;y&quot;] {{.Tag}}')
    expect(out).not.toContain('a-["y"]')
  })

  // A template literal with an UNSUPPORTED interpolation lowers to the BF101
  // sentinel `""` (the whole expression, not template text). It must still be
  // WRAPPED (`{{""}}`) so the sentinel sits inside an action — not emitted raw,
  // which would render literal quotes into the HTML. The template-literal
  // classification must therefore be reported to `renderExpression` only for a
  // *supported* parse, never for the error sentinel (#1937 review).
  test('unsupported template-literal interpolation is wrapped, not emitted raw', () => {
    const adapter = new GoTemplateAdapter()
    const out = adapter.renderExpression({ expr: '`x ${new Date()}`' } as IRExpression)
    expect(out).toBe('{{""}}')
  })
})

// The wrap-or-not decision (`isTemplateFragment`) treats a leading `{{` as the
// structural marker for "already a self-contained action block", and keys ONLY
// template literals off their parsed kind. That is correct because of a
// load-bearing invariant: a template literal is the *only* expression form that
// interleaves author literal text with `{{...}}` actions, so every OTHER
// fragment producer (ternary, find().prop, filter().length, …) emits a pure
// action block that begins with `{{`. These tests pin that invariant: if a
// future emitter prepends literal text to an action block, its output stops
// starting with `{{`, this fails, and the fix is to give that shape a parsed
// kind `isTemplateFragment` can detect (as template literals are handled) —
// NOT to fall back to a fragile `{{` substring scan.
describe('GoTemplateAdapter - template-fragment invariant (#1937)', () => {
  const adapter = new GoTemplateAdapter()
  const blockProducers: [string, string][] = [
    ['ternary', "flag ? 'a' : 'b'"],
    ['find().prop', 'items.find(i => i.active).name'],
    ['findLast().prop', 'items.findLast(i => i.active).name'],
    ['filter().length', 'items.filter(i => i.active).length'],
  ]
  for (const [label, expr] of blockProducers) {
    test(`${label} lowers to a {{-leading action block (no leading literal text)`, () => {
      const out = adapter.renderExpression({ expr } as IRExpression)
      expect(out.startsWith('{{')).toBe(true)
    })
  }
})

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

    test('module pure-string const referenced in className inlines the literal (#1467 Phase 2b)', () => {
      // A module-scope `const X = 'literal'` used inside a className
      // template literal must inline its value, NOT emit `{{.X}}` against a
      // Props field that never exists (Go fails `can't evaluate field X`).
      // Hono inlines it at runtime; this restores byte-parity.
      const source = `
"use client"
const labelClasses = 'flex items-center group-data-[disabled=true]:opacity-50'
export function Label({ className = '' }: { className?: string }) {
  return <label className={\`\${labelClasses} \${className}\`} />
}
`
      const { template, types } = compileAndGenerate(source)
      // The literal is inlined as a Go string literal, escaped tokens intact.
      expect(template).toContain(
        '{{"flex items-center group-data-[disabled=true]:opacity-50"}}',
      )
      // No struct-field reference to the const, and no Props field for it.
      expect(template).not.toContain('.LabelClasses')
      expect(types).not.toContain('LabelClasses')
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

    test('bakes typed struct array-literal initial values into NewXxxProps (#1672)', () => {
      // A signal typed `Item[]` lands in a `[]Item` field whose template loop
      // body reaches each element via struct field access (`.ID`). Baking the
      // inline literal as a Go struct slice — capitalising keys to match the
      // generated field names — lets the Go SSR render the list. Previously
      // `convertInitialValue` returned `nil` for any array literal, freezing
      // SSR loops to empty (the reason whole-item-conditional loop fixtures
      // had to skip Go render conformance — #1665 / #1672).
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: string }
export function List() {
  const [items] = createSignal<Item[]>([{ id: "a" }, { id: "b" }, { id: "c" }])
  return <ul>{items().map((t) => <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      expect(types).not.toContain('Items: nil,')
      expect(types).toContain('Items: []Item{')
      expect(types).toContain('Item{ID: "a"}')
      expect(types).toContain('Item{ID: "b"}')
      expect(types).toContain('Item{ID: "c"}')
    })

    test('bakes scalar array-literal initial values into NewXxxProps (#1672)', () => {
      // Scalar loops render each element via `{{.}}`, so an `[]interface{}`
      // (untyped) or `[]string` (typed) slice literal both render correctly.
      const adapter = new GoTemplateAdapter()
      const untypedIr = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Tags() {
  const [tags] = createSignal(["x", "y", "z"])
  return <ul>{tags().map((t) => <li key={t}>{t}</li>)}</ul>
}
`)
      expect(adapter.generate(untypedIr).types!).toContain(
        'Tags: []interface{}{"x", "y", "z"},',
      )

      const typedIr = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Tags() {
  const [tags] = createSignal<string[]>(["x", "y", "z"])
  return <ul>{tags().map((t) => <li key={t}>{t}</li>)}</ul>
}
`)
      expect(adapter.generate(typedIr).types!).toContain(
        'Tags: []string{"x", "y", "z"},',
      )
    })

    test('bakes a numeric scalar array from the carried tree (Roadmap A-3)', () => {
      // The analyzer carries `SignalInfo.parsed`, so the scalar-array bake
      // reads the structured tree (`parsedLiteralToGo`) instead of re-parsing
      // the value string with `ts.createSourceFile`. Each numeric element uses
      // the carried raw token (= `NumericLiteral.text`), so the bake matches
      // the fallback byte-for-byte — including TS's `.text` normalisation of
      // `1e3` → `1000` and `0x10` → `16`.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Nums() {
  const [ns] = createSignal<number[]>([1, 2, 1e3, 0x10])
  return <ul>{ns().map((n) => <li key={n}>{n}</li>)}</ul>
}
`)
      expect(adapter.generate(ir).types!).toContain(
        'Ns: []int{1, 2, 1000, 16},',
      )
    })

    test('synthesises a struct for an untyped object array and bakes it (#1680)', () => {
      // An untyped object array has no element type to bake against. Rather
      // than leave it nil (empty SSR loop), infer a struct from the literal's
      // shape, emit it, type the signal field as a slice of it, and bake the
      // items — so the loop body's struct field access (`.ID`) resolves.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [items] = createSignal([{ id: "a", n: 1, ok: true }, { id: "b", n: 2, ok: false }])
  return <ul>{items().map((t) => <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      // A struct is synthesised with one field per inferred key + Go type.
      expect(types).toMatch(/type \w+ struct \{[\s\S]*ID string[\s\S]*N int[\s\S]*Ok bool[\s\S]*\}/)
      // The signal field is a slice of the synthesised struct, not []interface{}.
      expect(types).toMatch(/Items \[\]\w+ `json:"items"`/)
      expect(types).not.toContain('Items []interface{}')
      // The initial items are baked, not nil.
      expect(types).not.toContain('Items: nil,')
      expect(types).toMatch(/Items: \[\]\w+\{\w+\{ID: "a", N: 1, Ok: true\}, \w+\{ID: "b", N: 2, Ok: false\}\}/)
    })

    test('keeps nil for an untyped object array with inconsistent shapes (#1680)', () => {
      // Elements must share one shape to synthesise a struct. A key missing
      // from some elements (or a type that disagrees across elements) can't map
      // to a single struct, so we bail to nil rather than guess.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [items] = createSignal([{ id: "a" }, { id: "b", extra: 1 }])
  return <ul>{items().map((t) => <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      expect(adapter.generate(ir).types!).toContain('Items: nil,')
    })

    test('keeps nil for an untyped object array with non-scalar values (#1680)', () => {
      // A nested object/array value has no scalar Go type to infer, so the
      // shape can't be synthesised — bail to nil.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [items] = createSignal([{ id: "a", tags: ["x"] }])
  return <ul>{items().map((t) => <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      expect(adapter.generate(ir).types!).toContain('Items: nil,')
    })

    test('widens mixed int/float keys to float64 and keeps negatives (#1680)', () => {
      // A key seen as both an integer and a fractional literal across elements
      // can't be `int`; widen it to `float64`. Negative numeric literals keep
      // their sign in the baked value.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [pts] = createSignal([{ x: 1, y: -2 }, { x: 2.5, y: -3 }])
  return <ul>{pts().map((p) => <li key={p.x}>{p.x}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      // x mixes 1 and 2.5 → float64; y stays int (both integer literals).
      expect(types).toMatch(/X float64[\s\S]*Y int/)
      expect(types).toContain('{X: 1, Y: -2}')
      expect(types).toContain('{X: 2.5, Y: -3}')
    })

    test('keeps nil when the synthesised name collides with a user type (#1680)', () => {
      // The struct name is `<Component><Signal>Item`. If the user already
      // declares that exact type, synthesis bails rather than shadowing it.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type ListItemsItem = { id: string }
export function List() {
  const [items] = createSignal([{ id: "a" }])
  return <ul>{items().map((t) => <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      expect(adapter.generate(ir).types!).toContain('Items: nil,')
    })

    test('synthesises a distinct struct per untyped object-array signal (#1680)', () => {
      // Two untyped signals get component+getter-prefixed names, so their
      // synthesised structs and fields don't collide.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [rows] = createSignal([{ id: "a" }])
  const [cols] = createSignal([{ label: "x" }])
  return <ul>{rows().map((r) => <li key={r.id}>{r.id}</li>)}{cols().map((c) => <li key={c.label}>{c.label}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      expect(types).toContain('type ListRowsItem struct {')
      expect(types).toContain('type ListColsItem struct {')
      expect(types).toMatch(/Rows \[\]ListRowsItem/)
      expect(types).toMatch(/Cols \[\]ListColsItem/)
      expect(types).toContain('Rows: []ListRowsItem{ListRowsItem{ID: "a"}}')
      expect(types).toContain('Cols: []ListColsItem{ListColsItem{Label: "x"}}')
    })

    test('keeps nil for non-literal array initial values (#1672)', () => {
      // A signal whose array initial value is a function call / variable
      // reference cannot be evaluated at codegen time — it must stay nil so
      // the handler populates it (no behaviour change for these cases).
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

function build(): string[] { return [] }
export function Dyn() {
  const [items] = createSignal(build())
  return <ul>{items().map((t) => <li key={t}>{t}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      expect(types).toContain('Items: nil,')
    })

    test('keeps nil for object keys that are not Go-identifier-safe (#1675 review)', () => {
      // A quoted key like "data-id" capitalises to `Data-id`, which is not a
      // valid Go struct field identifier — baking it would emit a keyed struct
      // literal that doesn't compile, so the whole array must stay nil.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Row = { "data-id": string }
export function Rows() {
  const [rows] = createSignal<Row[]>([{ "data-id": "a" }])
  return <ul>{rows().map((r) => <li key={r["data-id"]}>{r["data-id"]}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      expect(types).toContain('Rows: nil,')
    })

    test('collapses whitespace-padded empty array literal to nil (#1675 review)', () => {
      // The empty-literal fast-path must match `[ ]` too, not only the exact
      // `[]`, so a padded empty initial value still defaults to nil rather than
      // baking an empty slice literal.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Empty() {
  const [items] = createSignal<string[]>([ ])
  return <ul>{items().map((t) => <li key={t}>{t}</li>)}</ul>
}
`)
      const types = adapter.generate(ir).types!
      expect(types).toContain('Items: nil,')
      expect(types).not.toContain('Items: []string{}')
    })

    test('bakes generic Array<T> / ReadonlyArray<T> initial values like T[] (#1675 review)', () => {
      // `createSignal<Array<T>>` reaches the analyzer as a generic type
      // reference, not a `T[]` array node. The analyzer normalises both to the
      // same array TypeInfo, so baking treats them identically — element typing
      // (and struct-element baking) is preserved rather than degrading to nil.
      const adapter = new GoTemplateAdapter()
      const scalarIr = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Tags() {
  const [tags] = createSignal<Array<string>>(["x", "y"])
  return <ul>{tags().map((t) => <li key={t}>{t}</li>)}</ul>
}
`)
      expect(adapter.generate(scalarIr).types!).toContain('Tags: []string{"x", "y"},')

      const structIr = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: string }
export function List() {
  const [items] = createSignal<ReadonlyArray<Item>>([{ id: "a" }])
  return <ul>{items().map((t) => <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      expect(adapter.generate(structIr).types!).toContain('Items: []Item{Item{ID: "a"}},')
    })
  })

  describe('conditional inline-object spread (textarea aria-describedby)', () => {
    // `{...(cond ? { 'aria-describedby': cond } : {})}` lowers to an
    // IIFE-of-maps in `NewXxxProps` so the falsy branch OMITS the key
    // (SpreadAttrs does not filter empty strings). The fixture only
    // exercises the falsy branch; this pins the TRUTHY branch.
    test('lowers to a conditional map IIFE and keeps the {{bf_spread_attrs}} template', () => {
      const source = `
function Box({ describedBy }: { describedBy?: string }) {
  return <div {...(describedBy ? { 'aria-describedby': describedBy } : {})} />
}
`
      const { template, types } = compileAndGenerate(source)
      // Template emission is unchanged from the proven {...props} path.
      expect(template).toContain('{{bf_spread_attrs .Spread_0}}')
      // The bag value is a conditional map built in NewBoxProps. The
      // prop type is unresolved (interface{}), so the condition routes
      // through `bf.Truthy` for a faithful JS `Boolean(x)` test.
      expect(types).toContain('Spread_0: func() map[string]any {')
      expect(types).toContain('if bf.Truthy(in.DescribedBy) {')
      expect(types).toContain('return map[string]any{"aria-describedby": in.DescribedBy}')
      expect(types).toContain('return map[string]any{}')
    })

    test('resolves the object value reference and key for a second prop', () => {
      const source = `
function Box({ label }: { label: string }) {
  return <div {...(label ? { 'data-label': label } : {})} />
}
`
      const { types } = compileAndGenerate(source)
      // The condition prop and the value reference resolve to `in.<Field>`,
      // the static key is preserved. (The analyzer surfaces these
      // destructured props as `unknown`/`interface{}`, so the condition
      // routes through `bf.Truthy` for a faithful JS truthiness test.)
      expect(types).toContain('if bf.Truthy(in.Label) {')
      expect(types).toContain('return map[string]any{"data-label": in.Label}')
    })

    test('refuses a non-identifier condition with BF101 (out-of-shape fallback)', () => {
      const adapter = new GoTemplateAdapter()
      const source = `
function Box({ a, b }: { a?: string; b?: string }) {
  return <div {...(a === b ? { 'data-x': a } : {})} />
}
`
      const ir = compileToIR(source, adapter)
      adapter.generate(ir)
      const errs = (adapter as unknown as { errors: { code: string }[] }).errors
      expect(errs.some(e => e.code === 'BF101')).toBe(true)
    })
  })

  describe('local-const conditional-spread resolution (#checkbox icon)', () => {
    // A FUNCTION-scope const holding a `cond ? {…} : {}` ternary, then
    // spread as a bare identifier (`{...sizeAttrs}`), resolves through the
    // same conditional-spread lowering as the inline form. CheckIcon's
    // `const sizeAttrs = size ? {…} : {}` is exactly this shape.
    test('resolves a bare-identifier spread of a function-scope conditional const', () => {
      const source = `
function Box({ flag }: { flag?: boolean }) {
  const attrs = flag ? { 'data-on': 'yes' } : {}
  return <div {...attrs} />
}
`
      const { template, types } = compileAndGenerate(source)
      expect(template).toContain('{{bf_spread_attrs .Spread_0}}')
      expect(types).toContain('Spread_0: func() map[string]any {')
      expect(types).toContain('return map[string]any{"data-on": "yes"}')
      expect(types).toContain('return map[string]any{}')
    })

    // A const that resolves to another bare identifier must NOT be
    // forwarded (loop guard) — it falls through to BF101 like any other
    // unsupported spread identifier.
    test('does not forward a const that aliases another identifier (loop guard)', () => {
      const adapter = new GoTemplateAdapter()
      const source = `
function Box({ other }: { other?: object }) {
  const attrs = other
  return <div {...attrs} />
}
`
      const ir = compileToIR(source, adapter)
      adapter.generate(ir)
      const errs = (adapter as unknown as { errors: { code: string }[] }).errors
      expect(errs.some(e => e.code === 'BF101')).toBe(true)
    })
  })

  describe('Record<staticKeys,scalar>[propKey] spread value (#checkbox icon)', () => {
    // `const sizeMap: Record<IconSize, number> = { sm: 16, ... }` indexed
    // by a prop inside a conditional-spread object value lowers to an
    // inline indexed Go map keyed via `fmt.Sprint(in.<Field>)`. This is
    // CheckIcon's `{ width: sizeMap[size], height: sizeMap[size] }` shape.
    test('lowers an indexed module-const map to an inline fmt.Sprint-keyed map and adds the fmt import', () => {
      const source = `
const sizeMap: Record<string, number> = { sm: 16, md: 20, lg: 24, xl: 32 }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`
      const { types } = compileAndGenerate(source)
      expect(types).toContain(
        'map[string]any{"sm": 16, "md": 20, "lg": 24, "xl": 32}[fmt.Sprint(in.Size)]',
      )
      // The `"fmt"` import is emitted only when this lowering fires.
      expect(types).toContain('\t"fmt"')
    })

    test('lowers string-valued record maps too', () => {
      const source = `
const labelMap: Record<string, string> = { a: 'Alpha', b: 'Beta' }
function Box({ k }: { k?: string }) {
  const attrs = k ? { 'data-label': labelMap[k] } : {}
  return <div {...attrs} />
}
`
      const { types } = compileAndGenerate(source)
      expect(types).toContain('map[string]any{"a": "Alpha", "b": "Beta"}[fmt.Sprint(in.K)]')
    })

    // A non-scalar record value (object / array / call) is out of shape:
    // the spread object value can't lower, so the whole spread falls back
    // to BF101 rather than emitting an invalid map.
    test('refuses a non-scalar record value with BF101 (out-of-shape fallback)', () => {
      const adapter = new GoTemplateAdapter()
      const source = `
const sizeMap: Record<string, object> = { sm: { w: 1 } }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`
      const ir = compileToIR(source, adapter)
      adapter.generate(ir)
      const errs = (adapter as unknown as { errors: { code: string }[] }).errors
      expect(errs.some(e => e.code === 'BF101')).toBe(true)
    })
  })

  describe('props-object inherited-attribute enumeration (#checkbox)', () => {
    // A SolidJS props-object component (`function C(props: P)`) that reads
    // inherited attributes (`props.className` in a memo, `props.id` /
    // `props.disabled` on the root) must expose Input/Props fields for them,
    // even though `propsParams` only enumerates `P`'s own members. Without
    // this the caller's `className: ''` has no field — `unknown field
    // ClassName in struct literal of type CInput`.
    test('reads of props.className / props.id / props.disabled become Input fields', () => {
      const adapter = new GoTemplateAdapter()
      const source = `
"use client"
import { createMemo } from "@barefootjs/client"
interface P { tone?: string }
export function Widget(props: P) {
  const classes = createMemo(() => \`base \${props.className ?? ''}\`)
  return <button id={props.id} disabled={props.disabled ?? false} class={classes()}>x</button>
}
`
      const ir = compileToIR(source, adapter)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('ClassName string')
      // `id` is a bare-reference optional → interface{} (nillable, omittable).
      expect(types).toContain('ID interface{}')
      expect(types).toContain('Disabled bool')
    })

    // The className memo's SSR initial value must inline module string consts
    // (incl. `[...].join(' ')`) and resolve `props.className ?? ''` to the
    // ClassName field — not render the historical `0` placeholder.
    test('template-literal className memo inlines consts + props.className field', () => {
      const adapter = new GoTemplateAdapter()
      const source = `
"use client"
import { createMemo } from "@barefootjs/client"
const base = 'a b'
const states = ['c', 'd'].join(' ')
interface P { tone?: string }
export function Widget(props: P) {
  const classes = createMemo(() => \`\${base} \${states} \${props.className ?? ''} tail\`)
  return <button class={classes()}>x</button>
}
`
      const types = adapter.generateTypes(compileToIR(source, adapter))!
      expect(types).toContain('Classes: "a b" + " " + "c d" + " " + in.ClassName + " tail"')
    })

    // A boolean ternary memo (`isChecked = ctrl() ? c() : i()`) renders its
    // SSR zero as `false`, not the int `0`, so `aria-checked={isChecked()}`
    // matches Hono's `aria-checked="false"`.
    test('boolean ternary memo defaults to false, not 0', () => {
      const adapter = new GoTemplateAdapter()
      const source = `
"use client"
import { createSignal, createMemo } from "@barefootjs/client"
export function Toggle(props: { checked?: boolean; defaultChecked?: boolean }) {
  const [internal] = createSignal(props.defaultChecked ?? false)
  const [controlled] = createSignal<boolean | undefined>(props.checked)
  const isControlled = createMemo(() => props.checked !== undefined)
  const isChecked = createMemo(() => isControlled() ? controlled() : internal())
  return <button aria-checked={isChecked()}>x</button>
}
`
      const types = adapter.generateTypes(compileToIR(source, adapter))!
      expect(types).toContain('IsChecked bool')
      expect(types).toContain('IsChecked: false,')
    })
  })

  describe('cross-component child rest-bag routing (#checkbox)', () => {
    // A parent rendering a child with a non-param attribute whose name isn't a
    // valid Go identifier (`<CheckIcon data-slot="..."/>`) must route it into
    // the child's rest bag (`Props: map[string]any{...}`), not a hyphenated
    // top-level field (`Data-slot:`), when the child has a `...props` rest
    // spread. Requires the child's shape registered first.
    test('routes a hyphenated non-param child attr into the child rest bag', () => {
      const adapter = new GoTemplateAdapter()
      const childSource = `
"use client"
export function Leaf({ size, ...props }: { size?: string }) {
  return <span {...props}>{size}</span>
}
`
      const childIr = compileToIR(childSource, adapter)
      adapter.registerChildComponentShape(childIr)
      const parentSource = `
"use client"
import { Leaf } from './leaf'
export function Host() {
  return <div><Leaf data-slot="indicator" size="sm" /></div>
}
`
      const types = adapter.generateTypes(compileToIR(parentSource, adapter))!
      // Non-param hyphenated attr lands in the rest bag, not a Data-slot field.
      expect(types).not.toContain('Data-slot:')
      expect(types).toContain('Props: map[string]any{"data-slot": "indicator"}')
      // A declared param (`size`) still binds as a top-level field.
      expect(types).toContain('Size: "sm"')
    })
  })

  describe('nullish optional-attribute omission (textarea rows)', () => {
    // An optional, no-default prop whose Go field type resolves to
    // `interface{}` (nillable) is emitted with a `ne .X nil` guard so an
    // unset value DROPS the attribute instead of rendering `attr=""` —
    // matching Hono's nullish-attribute omission. Concrete/defaulted
    // props are never nil and stay unconditional.
    test('guards a nillable optional attr with {{if ne .X nil}}', () => {
      const source = `
function C({ rows }: { rows?: number }) {
  return <textarea rows={rows} />
}
`
      const { template } = compileAndGenerate(source)
      expect(template).toContain('{{if ne .Rows nil}}rows="{{.Rows}}"{{end}}')
      // Must NOT emit the bare unconditional form.
      expect(template).not.toMatch(/(?<!if ne \.Rows nil}})rows="\{\{\.Rows\}\}"/)
    })

    test('leaves a concrete/defaulted attr unconditional (scope did not widen)', () => {
      const source = `
function C({ value = '' }: { value?: string }) {
  return <textarea value={value} />
}
`
      const { template } = compileAndGenerate(source)
      // `value` has a destructure default → concrete `string` field →
      // never nil → emitted unconditionally, exactly like Hono's value="".
      expect(template).toContain('value="{{.Value}}"')
      expect(template).not.toContain('if ne .Value nil')
    })
  })

  describe('loop body outer-scope references (#1677)', () => {
    test('references an outer signal inside a loop via $ root scope, not the element', () => {
      // Inside `{{range $_, $t := .Items}}` the dot is rebound to the loop
      // element, so a reference to the outer `sel` signal must reach the root
      // data through Go template's `$` (`$.Sel`), not `.Sel` — which would
      // resolve against the element struct (no `Sel` field → <nil>).
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: string }
export function L() {
  const [items] = createSignal<Item[]>([{ id: "a" }, { id: "b" }])
  const [sel] = createSignal("b")
  return <ul>{items().map((t) => sel() === t.id && <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      const template = adapter.generate(ir).template
      // The loop element field stays element-scoped; the outer signal is rooted.
      expect(template).toContain('eq $.Sel .ID')
      expect(template).not.toContain('eq .Sel .ID')
    })

    test('references an outer prop inside a loop via $ root scope', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: string }
export function L(props: { active: string }) {
  const [items] = createSignal<Item[]>([{ id: "a" }])
  return <ul>{items().map((t) => props.active === t.id && <li key={t.id}>{t.id}</li>)}</ul>
}
`)
      const template = adapter.generate(ir).template
      expect(template).toContain('eq $.Active .ID')
      expect(template).not.toContain('eq .Active .ID')
    })

    test('references an outer loop variable from a nested loop via its range var, not root', () => {
      // In nested `{{range}}`s the inner dot is the inner element; the outer
      // loop value is in scope as the Go range variable `$group` (declared by
      // the outer `{{range $_, $group := .Groups}}`). A reference to the outer
      // item from the inner body must use `$group.ID`, not `$.Group.ID` (root)
      // nor `.ID` (inner element).
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: string }
type Group = { id: string; items: Item[] }
export function L() {
  const [groups] = createSignal<Group[]>([])
  return <ul>{groups().map((group) => <li key={group.id}>{group.items.map((item) => <span key={item.id}>{group.id}:{item.id}</span>)}</li>)}</ul>
}
`)
      const template = adapter.generate(ir).template
      // Outer item referenced from the inner loop body resolves to $group.ID.
      expect(template).toContain('$group.ID')
      expect(template).not.toContain('$.Group.ID')
    })

    test('compares an outer loop variable in a nested loop condition via its range var', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: string; groupId: string }
type Group = { id: string; items: Item[] }
export function L() {
  const [groups] = createSignal<Group[]>([])
  return <ul>{groups().map((group) => <li key={group.id}>{group.items.map((item) => group.id === item.groupId && <span key={item.id}>{item.id}</span>)}</li>)}</ul>
}
`)
      const template = adapter.generate(ir).template
      expect(template).toContain('eq $group.ID .GroupId')
      expect(template).not.toContain('eq $.Group.ID')
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

    test('bakes hoisted children={<span/>} with the parent scopeID spliced into bf-s (#1326 / #1335)', () => {
      // `children` passed as an attribute lands as a `jsx-children` prop and
      // its span carries `needsScope: true`. The root `bf-s` must resolve to
      // the *parent* scope at render time, so the bake splices `scopeID`
      // (matching the client `__BF_PARENT_SCOPE__` placeholder) rather than
      // emitting a static string or dropping the child.
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
export function Host() { return <Box children={<span>x</span>} /> }
function Box({ children }: { children: any }) { return <div>{children}</div> }
`)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('Children: template.HTML("<span bf-s=\\"" + scopeID + "\\">x</span>")')
      expect(types).toContain('"html/template"')
    })


    test('fragment-wrapped hoisted children bake to the same scoped shape (#1335)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
export function Host() { return <Box children={<><span>x</span></>} /> }
function Box({ children }: { children: any }) { return <div>{children}</div> }
`)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('Children: template.HTML("<span bf-s=\\"" + scopeID + "\\">x</span>")')
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

    test('children prop is excluded from bf-p serialization (json:"-") (#1952)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
export function Box({ children }: { children: any }) {
  return <div>{children}</div>
}
`, adapter)
      const types = adapter.generateTypes(ir)!
      expect(types).toMatch(/Children\s+\S+\s+`json:"-"`/)
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
      // #2018 P2: `.every(t => t.done)` now lowers through the evaluator —
      // the predicate body travels as serialized ParsedExpr JSON.
      expect(result.template).toContain('bf_every_eval .Todos')
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
      expect(result.template).toContain('gt (len (bf_filter_eval .Tags')
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
      expect(result.template).toContain('gt (len (bf_filter_eval .Tags')
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

    test('nested-callback refusal keeps the emitted template syntactically valid (#2038)', () => {
      // The BF101 contract itself is pinned at the shared conformance layer
      // (`filter-nested-callback-predicate` / `filter-nested-find-predicate`
      // expectedDiagnostics; the `/* @client */` suppression twin renders
      // clean). This test pins the GO-SPECIFIC half: the refusal must emit
      // the `false` sentinel — not a half-rendered predicate like `.Some` —
      // so `text/template` parsing doesn't cascade into secondary errors.
      const adapter = new GoTemplateAdapter()
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { id: number }

export function Picker() {
  const [items, setItems] = createSignal<Item[]>([])
  const [picked, setPicked] = createSignal<Item[]>([])
  return <ul>{items().filter(t => !picked().some(p => p.id === t.id)).map(t => <li key={t.id}>{t.id}</li>)}</ul>
}
`, adapter)
      expect(adapter.errors.some(e => e.code === 'BF101')).toBe(true)
      expect(result.template).not.toContain('.Some')
      expect(result.template).toContain('{{if false}}')
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
      // #2018 P2: `.find(t => t.done)` lowers through the evaluator; the
      // trailing `true` is the forward-search flag (find / findIndex).
      expect(result.template).toContain('bf_find_eval .Items')
      expect(result.template).toContain('true bf_env')
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
      // #2018 P2: `.findLast(t => t.done)` shares `bf_find_eval` with `.find`,
      // distinguished by the `false` (backward) forward-flag.
      expect(result.template).toContain('bf_find_eval .Items')
      expect(result.template).toContain('false bf_env')
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
      // #2018 P2: `.findLastIndex` lowers via `bf_find_index_eval` with the
      // `false` (backward) forward-flag.
      expect(result.template).toContain('bf_find_index_eval .Items')
      expect(result.template).toContain('false bf_env')
    })

    test('renders findLastIndex() with a pure complex predicate via the evaluator', () => {
      // #2018 P2: a pure (call-free) complex predicate like
      // `t.price > 50 && t.active` is no longer confined to the
      // field-equality catalogue — it serializes to a ParsedExpr and lowers
      // through `bf_find_index_eval` (backward `false` flag), replacing the
      // old `{{range}}` $bf_r accumulator. The range fallback is now reserved
      // for predicates the evaluator can't model (e.g. a signal-getter call,
      // covered by the findLast test above).
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; active: boolean }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  return <div>{items().findLastIndex(t => t.price > 50 && t.active)}</div>
}
`)
      expect(result.template).toContain('bf_find_index_eval .Items')
      expect(result.template).toContain('false bf_env')
      expect(result.template).not.toContain('$bf_r')
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

    test('Math.min(a, b) emits bf_min and parenthesises compound operands', () => {
      // The blog's NowPlaying progress bar: `Math.min(100, (elapsed / TRACK) *
      // 100)`. Math.min must lower to bf_min, the nested arithmetic must keep
      // its inner parens (so bf_mul / bf_div get exactly two args each), and the
      // module const TRACK must inline to its literal value.
      const result = compileAndGenerate(`
        'use client'
        const TRACK = 8
        export function Foo(props: { elapsed: number }) {
          return <div data-x={Math.min(100, (props.elapsed / TRACK) * 100)}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_min 100 (bf_mul (bf_div .Elapsed 8) 100)')
    })

    test('Math.max(a, b) emits bf_max', () => {
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { a: number; b: number }) {
          return <div data-x={Math.max(props.a, props.b)}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_max .A .B')
    })

    test('nested arithmetic parenthesises a compound operand', () => {
      // Without wrapping, `(a / b) * c` would emit `bf_mul bf_div .A .B .C`,
      // handing bf_mul four args. Each compound operand must be parenthesised.
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { a: number; b: number; c: number }) {
          return <div data-x={(props.a / props.b) * props.c}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_mul (bf_div .A .B) .C')
    })

    test('module numeric const inlines its literal value', () => {
      const result = compileAndGenerate(`
        'use client'
        const SIZE = 12
        export function Foo(props: { n: number }) {
          return <div data-x={props.n + SIZE}>hi</div>
        }
      `)
      // SIZE inlines to 12 rather than emitting a bogus `.SIZE` Props field.
      expect(result.template).toContain('bf_add .N 12')
    })

    test('module numeric const with separators inlines the stripped value', () => {
      const result = compileAndGenerate(`
        'use client'
        const GAP = 100_000
        export function Foo(props: { n: number }) {
          return <div data-x={props.n + GAP}>hi</div>
        }
      `)
      // 100_000 (TS numeric separator) → 100000; Go template literals reject "_".
      expect(result.template).toContain('bf_add .N 100000')
    })

    test('registry exposes the expected V1 callees', () => {
      // Pin the V1 surface so a future refactor doesn't accidentally
      // drop a primitive. New entries are additive — extend this
      // list rather than replace.
      const a = new GoTemplateAdapter()
      const keys = Object.keys(a.templatePrimitives ?? {}).sort()
      expect(keys).toEqual(['JSON.stringify', 'Math.ceil', 'Math.floor', 'Math.max', 'Math.min', 'Math.round', 'Number', 'String'])
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
      // variant key and returns the matching case. The switch key goes
      // through `fmt.Sprint` (not a `.(string)` assertion) so it
      // compiles for both `interface{}`-typed fields and the `string`
      // fields the shared inherited-prop augmentation synthesises
      // (#1896).
      expect(goCode).toContain('func() string {')
      expect(goCode).toContain('switch fmt.Sprint(in.Variant)')
      expect(goCode).toContain('case "a": return "class-a"')
      expect(goCode).toContain('case "b": return "class-b"')
    })

    test('string-tolerant eq keeps a compound operand grouped (#1903 review)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
export function T(props: { placement?: 'top' | 'left' }) {
  return <div data-side={(props.placement ?? 'top') === 'left' ? 'l' : 'o'}>x</div>
}
`, adapter)
      const out = adapter.generate(ir)
      // The non-literal side routes through bf_string as ONE argument:
      // `(bf_string (or .Placement "top"))`. Stripping the inner parens
      // would hand the parser three arguments and fail at runtime with
      // `bf_string: want 1 got 3`.
      expect(out.template).toContain('eq (bf_string (or .Placement "top")) "left"')
      expect(out.template).not.toContain('bf_string or ')
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
      // #2018 P2: the normalised `_t => _t.done` predicate lowers through the
      // evaluator (`bf_filter_eval`).
      expect(result.template).toContain('bf_filter_eval .Items')
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
      // #2018 P2: the normalised `_t => _t.done` predicate lowers through the
      // evaluator (`bf_filter_eval`).
      expect(result.template).toContain('bf_filter_eval .Items')
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
import { fixture as arraySliceCopyFixture } from '../../../adapter-tests/fixtures/methods/array-slice-copy'
import { fixture as arrayJoinDefaultFixture } from '../../../adapter-tests/fixtures/methods/array-join-default'
import { fixture as arrayAtDefaultFixture } from '../../../adapter-tests/fixtures/methods/array-at-default'
import { fixture as arrayConcatCopyFixture } from '../../../adapter-tests/fixtures/methods/array-concat-copy'
import { fixture as arrayReverseFixture } from '../../../adapter-tests/fixtures/methods/array-reverse'
import { fixture as arrayToReversedFixture } from '../../../adapter-tests/fixtures/methods/array-toReversed'
import { fixture as stringToLowerCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toLowerCase'
import { fixture as stringToUpperCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toUpperCase'
import { fixture as stringTrimFixture } from '../../../adapter-tests/fixtures/methods/string-trim'
// #1448 Tier B — string methods.
import { fixture as stringSplitFixture } from '../../../adapter-tests/fixtures/methods/string-split'
import { fixture as stringSplitLimitFixture } from '../../../adapter-tests/fixtures/methods/string-split-limit'
import { fixture as stringStartsWithFixture } from '../../../adapter-tests/fixtures/methods/string-startsWith'
import { fixture as stringStartsWithPositionFixture } from '../../../adapter-tests/fixtures/methods/string-startsWith-position'
import { fixture as stringEndsWithFixture } from '../../../adapter-tests/fixtures/methods/string-endsWith'
import { fixture as stringEndsWithPositionFixture } from '../../../adapter-tests/fixtures/methods/string-endsWith-position'
import { fixture as stringReplaceFixture } from '../../../adapter-tests/fixtures/methods/string-replace'
import { fixture as stringRepeatFixture } from '../../../adapter-tests/fixtures/methods/string-repeat'
import { fixture as stringPadStartFixture } from '../../../adapter-tests/fixtures/methods/string-padStart'
import { fixture as stringPadEndFixture } from '../../../adapter-tests/fixtures/methods/string-padEnd'
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

describe('GoTemplateAdapter - keyed loop-child data-key (#1297, toggle-shared)', () => {
  // A keyed `.map` of a child component stamps each item's `data-key` from the
  // loop `key` expression, emitted on the child component's scope root —
  // matching Hono.
  // `List` is declared first so `compileToIR` (which picks the first IR)
  // returns the parent that owns the keyed loop.
  const source = `
"use client"
import { createSignal } from "@barefootjs/client"
type ItemProps = { label: string; defaultOn?: boolean }
export function List({ items }: { items: ItemProps[] }) {
  return <ul>{items.map((item) => <Item key={item.label} label={item.label} defaultOn={item.defaultOn} />)}</ul>
}
function Item(props: ItemProps) {
  const [on] = createSignal(props.defaultOn ?? false)
  return <div className="item">{on() ? props.label : ''}</div>
}
`
  test('Props carries a BfDataKey field', () => {
    const { types } = compileAndGenerate(source)
    expect(types).toContain('BfDataKey string `json:"-"`')
  })

  test('loop-child init stamps BfDataKey from the loop key (item.Label)', () => {
    const { types } = compileAndGenerate(source)
    expect(types).toContain('[i].BfDataKey = fmt.Sprint(item.Label)')
    expect(types).toContain('\t"fmt"')
  })

  test('child component root emits data-key from BfDataKey', () => {
    const { template } = compileAndGenerate(source)
    // Space is inside the `{{if}}` so a non-keyed render adds nothing.
    expect(template).toContain('{{if .BfDataKey}} data-key="{{.BfDataKey}}"{{end}}')
  })
})

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
    // #1448 full-arity — zero-arg defaults. `.slice()` → start 0 (full
    // copy); `.join()` → default `,` separator.
    { fixture: arraySliceCopyFixture,   expect: 'bf_slice .Items 0' },
    { fixture: arrayJoinDefaultFixture, expect: 'bf_join (.Items) ","' },
    // `.at()` → index 0; `.concat()` → the receiver (shallow copy).
    { fixture: arrayAtDefaultFixture,   expect: 'bf_at .Items 0' },
    { fixture: arrayConcatCopyFixture,  expect: 'bf_join (.Items) "|"' },
    { fixture: arrayReverseFixture,     expect: 'bf_reverse .Items' },
    // .toReversed shares the helper with .reverse — pinning both
    // routings catches a future divergence between them.
    { fixture: arrayToReversedFixture,  expect: 'bf_reverse .Items' },
    { fixture: stringToLowerCaseFixture,expect: 'bf_lower .Value' },
    { fixture: stringToUpperCaseFixture,expect: 'bf_upper .Value' },
    { fixture: stringTrimFixture,       expect: 'bf_trim .Value' },
    // #1448 Tier B — string → array. `.split(',')` lowers to
    // `bf_split`, here chained into `.join('|')` so the slice is
    // observable (`bf_join (bf_split .Value ",") "|"`).
    { fixture: stringSplitFixture,      expect: 'bf_split .Value ","' },
    { fixture: stringSplitLimitFixture, expect: 'bf_split .Value "," 2' },
    // #1448 Tier B — string → boolean at condition position, so the
    // emit lands inside `{{if ...}}`.
    { fixture: stringStartsWithFixture, expect: '{{if bf_starts_with .Value .Prefix}}' },
    { fixture: stringStartsWithPositionFixture, expect: '{{if bf_starts_with .Value "world" 6}}' },
    { fixture: stringEndsWithFixture,   expect: '{{if bf_ends_with .Value .Suffix}}' },
    { fixture: stringEndsWithPositionFixture,   expect: '{{if bf_ends_with .Value "hello" 5}}' },
    // #1448 Tier B — string → string, first-occurrence replace.
    { fixture: stringReplaceFixture,    expect: 'bf_replace .Value "o" "0"' },
    // #1448 Tier B — string → string, repeat n times.
    { fixture: stringRepeatFixture,     expect: 'bf_repeat .Value 3' },
    // #1448 Tier B — string → string, padded to a target width.
    { fixture: stringPadStartFixture,   expect: 'bf_pad_start .Value 5 "0"' },
    { fixture: stringPadEndFixture,     expect: 'bf_pad_end .Value 5 "."' },
    // #1448 Tier B — sort / toSorted. Both the standalone shapes and the
    // `.sort().map()` loop-hoist now lower through the evaluator (#2018 P1/P3):
    // the comparator body travels as serialized ParsedExpr to `bf_sort_eval`.
    { fixture: arraySortFieldAscFixture,  expect: 'bf_sort_eval .Items' },
    { fixture: arraySortFieldDescFixture, expect: 'bf_sort_eval .Items' },
    { fixture: arraySortPrimitiveFixture, expect: 'bf_sort_eval .Nums' },
    // localeCompare can't be evaluated, so it keeps the legacy `bf_sort` path
    // (both standalone and loop-hoist fall back).
    { fixture: arraySortLocaleFixture,    expect: 'bf_sort .Names "self" "" "string" "asc"' },
    // Multi-key (`||`-chain) here ends in a `localeCompare`, so the whole
    // comparator falls back to the structured `bf_sort` (one 4-string group
    // per comparison key, applied in priority order as tie-breakers).
    { fixture: arraySortMultiKeyFixture,  expect: 'bf_sort .Items "field" "Price" "numeric" "asc" "field" "Name" "string" "asc"' },
    // Relational-ternary comparator — a pure body, so it lowers via the
    // evaluator like the other field sorts.
    { fixture: arraySortTernaryFixture,   expect: 'bf_sort_eval .Items' },
    { fixture: arrayToSortedFixture,      expect: 'bf_sort_eval .Nums' },
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

// =============================================================================
// #1448 — `/* @client */` escape hatch for STILL-UNSUPPORTED methods
// =============================================================================
//
// The catalogue in #1448 documents `/* @client */` as the universal
// workaround for any Array/String method shape the template adapters
// can't lower. This block pins that contract for the Go adapter: for
// every remaining unsupported entry, the BARE form must surface a
// BF021/BF101 build error (so the user is told to act), and wrapping
// the expression in `/* @client */` must clear that error and emit a
// client-only placeholder so the Go SSR pass renders valid template
// the client runtime fills at hydration.
//
// History (#1448 follow-up): the unsupported *string* methods used to
// be a silent footgun — bare `.startsWith` / `.repeat` / … lowered to
// a Go method-call expression (`{{.Name.StartsWith "a"}}`) that passed
// the adapter's gate with NO diagnostic, then exploded at `go run`
// time with `can't evaluate field StartsWith in type string`. They are
// now listed in `UNSUPPORTED_METHODS`, so `isSupported` refuses them
// and `convertExpressionToGo` records BF101 — the same treatment the
// unsupported array methods already got. These tests pin that parity.
describe('GoTemplateAdapter - #2018 reduce via the evaluator', () => {
  // A standalone `.reduce(fn, init)` now lowers through the evaluator: the
  // reducer body is serialized to ParsedExpr JSON and folded by `bf_reduce_eval`.
  // The body carries the JS field name (`x.id`); the runtime field reader
  // (`getFieldValue`) resolves it case-variantly against the Go struct field
  // (`ID`) at render time, so no compile-time capitalisation is needed (the
  // former #1728 initialism gotcha is moot on this path).
  test('reduce over a field lowers to bf_reduce_eval with the serialized body', () => {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
function C({ items }: { items: { id: number }[] }) {
  return <div>{items.reduce((sum, x) => sum + x.id, 0)}</div>
}
export { C }
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    expect(template).toContain('bf_reduce_eval .Items')
    // The seed is threaded through bf_number; the body is the serialized tree.
    expect(template).toContain('(bf_number "0")')
  })
})

describe('GoTemplateAdapter - #1448 Tier C .flat(depth?)', () => {
  function emitFlat(expr: string): string {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
function C({ rows }: { rows: number[][] }) {
  return <div>{${expr}}</div>
}
export { C }
`, adapter)
    return adapter.generate(ir).template ?? ''
  }

  test('.flat() emits bf_flat with default depth 1', () => {
    expect(emitFlat('rows.flat()')).toContain('bf_flat .Rows 1')
  })

  test('.flat(2) emits the explicit depth', () => {
    expect(emitFlat('rows.flat(2)')).toContain('bf_flat .Rows 2')
  })

  test('.flat(Infinity) emits the -1 full-depth sentinel', () => {
    expect(emitFlat('rows.flat(Infinity)')).toContain('bf_flat .Rows -1')
  })
})

describe('GoTemplateAdapter - #2073 value-producing .map(cb)', () => {
  function emitMap(expr: string): string {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
function C({ tags, users }: { tags: string[]; users: { name: string }[] }) {
  return <div>{${expr}}</div>
}
export { C }
`, adapter)
    return adapter.generate(ir).template ?? ''
  }

  // The blog-showcase shape (#1938/#1939): a value-returning `.map` (string
  // projection, not JSX) lowers through the evaluator — `bf_map_eval` projects
  // each element (no flatten) and composes through `bf_join`. (Like the
  // flatMap pins below, the projection JSON's quotes are backslash-escaped in
  // the Go-template string; the JSON itself is verified by the render
  // conformance fixtures + the runtime TestMapEval.)
  test('.map(t => `#${t}`).join(" ") emits bf_map_eval composed into bf_join', () => {
    const t = emitMap("tags.map(t => `#${t}`).join(' ')")
    expect(t).toContain('bf_join (bf_map_eval .Tags')
  })

  test('.map(u => u.name) emits bf_map_eval with the receiver', () => {
    const t = emitMap("users.map(u => u.name).join(', ')")
    expect(t).toContain('bf_map_eval .Users')
  })

  test('function-reference callback (.map(format)) still refuses with BF101', () => {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
const format = (t: string) => t
function C({ tags }: { tags: string[] }) {
  return <div>{tags.map(format).join(' ')}</div>
}
export { C }
`, adapter)
    adapter.generate(ir)
    const errs = (adapter as unknown as { errors: { code: string }[] }).errors
    expect(errs.some(e => e.code === 'BF101')).toBe(true)
  })
})

describe('GoTemplateAdapter - #1448 Tier C .flatMap(field projection)', () => {
  function emitFlatMap(expr: string): string {
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
function C({ rows }: { rows: { a: string; b: string; tags: string[] }[] }) {
  return <div>{${expr}}</div>
}
export { C }
`, adapter)
    return adapter.generate(ir).template ?? ''
  }

  // #2018 P3: `.flatMap(proj)` lowers through the evaluator — the projection
  // body serializes to ParsedExpr JSON and `bf_flat_map_eval` flattens the
  // results one level. The raw (lowercase) field name travels in the JSON; the
  // runtime field reader resolves it case-insensitively against Go data.
  // (The serialized projection JSON is embedded in a Go-template double-quoted
  // string — its quotes are backslash-escaped — so these pins assert the helper
  // + receiver; the projection JSON itself is verified by the render
  // conformance fixtures + the runtime TestFlatMapEval.)
  test('.flatMap(i => i.field) emits bf_flat_map_eval', () => {
    expect(emitFlatMap('rows.flatMap(i => i.tags).join(" ")')).toContain('bf_flat_map_eval .Rows')
  })

  test('.flatMap(i => i) emits bf_flat_map_eval (self projection)', () => {
    expect(emitFlatMap('rows.flatMap(i => i).join(" ")')).toContain('bf_flat_map_eval .Rows')
  })

  test('.flatMap(i => [i.a, i.b]) emits bf_flat_map_eval (array-literal projection)', () => {
    expect(emitFlatMap('rows.flatMap(i => [i.a, i.b]).join(" ")')).toContain('bf_flat_map_eval .Rows')
  })

  // (#2018 P5) A tuple with a string-literal element lowers the same way: the
  // whole array-literal body serializes and `bf_flat_map_eval` evaluates it per
  // item, so a non-member element no longer refuses (it did under the structured
  // `bf_flat_map_tuple` catalogue).
  test('.flatMap(i => [i.name, "x"]) emits bf_flat_map_eval (literal element)', () => {
    expect(emitFlatMap('rows.flatMap(i => [i.name, "x"]).join(" ")')).toContain('bf_flat_map_eval .Rows')
  })
})

describe('GoTemplateAdapter - #1448 @client escape hatch (unsupported methods)', () => {
  // Compile a single expression placed in `<div>` text position, with
  // and without the directive, and return both the build errors and
  // the emitted template.
  function emit(expr: string, client: boolean) {
    const marker = client ? '/* @client */ ' : ''
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string; n: number; tags: string[] }[]>([])
  const [name, setName] = createSignal("x")
  const myCmp = (a: { n: number }, b: { n: number }) => a.n - b.n
  return <div>{${marker}${expr}}</div>
}
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    return { errors: adapter.errors ?? [], template }
  }

  // Same shape but the expression is a `.map()` chain that renders a
  // loop (sort follow-ups land here). The client placeholder is a
  // loop comment rather than a text comment.
  function emitLoop(chain: string, client: boolean) {
    const marker = client ? '/* @client */ ' : ''
    const adapter = new GoTemplateAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string; n: number }[]>([])
  const myCmp = (a: { n: number }, b: { n: number }) => a.n - b.n
  return <ul>{${marker}${chain}}</ul>
}
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    return { errors: adapter.errors ?? [], template }
  }

  // Unsupported methods that surface as BF101 at build time: Tier C
  // array methods + Tier B/C string methods. `badEmit` is the invalid
  // Go fragment that must NOT survive into the template (the pre-fix
  // silent-footgun output for the string rows).
  const unsupported: Array<{ name: string; expr: string; badEmit: string }> = [
    // Tier C array methods. The arithmetic-fold `.reduce(fn, init)`
    // catalogue now lowers (pinned in the positive reduce-* fixtures);
    // the no-initial-value form stays refused — JS throws on an empty
    // array there, which a template can't mirror.
    { name: 'reduce (no init)', expr: `items().reduce((a, b) => a + b.n)`, badEmit: '.Reduce' },
    // (#2018 P5) The literal-element tuple `.flatMap(i => [i.name, "x"])` now
    // lowers through the evaluator (`bf_flat_map_eval` serializes the array-
    // literal body and flattens), so it is no longer refused — pinned positively
    // in the `.flatMap` describe block alongside the `[i.a, i.b]` form.
    // Lowered methods whose MEANINGFUL extra argument isn't lowered yet
    // (#1448): the `fromIndex` of `.includes`/`.indexOf`/`.lastIndexOf`
    // and the variadic `.concat`. The parser refuses these (silently
    // dropping the arg would change the result) rather than emitting a
    // render-crashing `.Includes` / `.Concat` field access. (The
    // zero-arg defaults `.join()`/`.slice()` and JS-ignored trailing
    // args like `.trim(1)` are accepted — pinned in the positive blocks.)
    { name: 'includes (2-arg fromIndex)', expr: `items().includes("a", 1)`, badEmit: '.Includes' },
    { name: 'concat (variadic)', expr: `items().concat(items(), items())`, badEmit: '.Concat' },
    // Tier B/C string methods — previously slipped through with no
    // diagnostic; now gated by `UNSUPPORTED_METHODS`. The full Tier B
    // string set (`split`, `startsWith`, `endsWith`, `replace`,
    // `repeat`, `padStart`, `padEnd`) has since landed its full-arity
    // lowering and moved to the positive fixture-pin block above. The
    // regex-pattern `replace` form is pinned separately below; `charAt`
    // is Tier C and stays refused entirely.
    { name: 'charAt', expr: `name().charAt(0)`, badEmit: '.Name.CharAt' },
  ]
  for (const { name, expr, badEmit } of unsupported) {
    test(`.${name}: bare raises BF101, @client clears it + emits client placeholder`, () => {
      const bare = emit(expr, false)
      expect(bare.errors.some(e => e.code === 'BF101')).toBe(true)
      // The unlowerable method call must NOT leak into the template;
      // the adapter degrades to a safe empty slot alongside the error.
      expect(bare.template).not.toContain(badEmit)

      const guarded = emit(expr, true)
      expect(guarded.errors).toEqual([])
      // Client-only text slot → `{{bfComment "client:sN"}}` placeholder.
      expect(guarded.template).toMatch(/bfComment "client:s\d+"/)
      expect(guarded.template).not.toContain(badEmit)
    })
  }

  // The diagnostic's `suggestion.message` is shaped by `isSupported`'s
  // `selfContained` flag: reasons that already spell out the fix are shown
  // as-is, while low-level parser reasons still get the adapter's generic
  // "Options" remediation appended so users never lose actionable steps.
  function suggestionFor(expr: string): string {
    const { errors } = emit(expr, false)
    const e = errors.find(e => e.code === 'BF101' || e.code === 'BF102')
    return e?.suggestion?.message ?? ''
  }

  test('self-contained reason is shown without the generic Options block', () => {
    // Generic unsupported-method reason already carries the remedy.
    const msg = suggestionFor('items().reduce((a, b) => a + b.n)')
    expect(msg).toContain('no SSR')
    expect(msg).not.toContain('Options:')
  })

  test('tailored forEach reason keeps its own guidance, no Options block', () => {
    const msg = suggestionFor('items().forEach(x => x)')
    expect(msg).toContain("'.map(")
    // The forEach message deliberately steers away from @client; the
    // generic Options block (which re-suggests it) must not be appended.
    expect(msg).not.toContain('Options:')
    expect(msg).not.toContain('@client')
  })

  test('low-level reason still gets the actionable Options block appended', () => {
    // `typeof` has no structured remedy reason → users must keep the
    // generic next steps (regression guard for #1730 review).
    const msg = suggestionFor('typeof items()')
    expect(msg).toContain('Options:')
    expect(msg).toContain('@client')
  })

  // Predicate-level use of an unsupported string method also fails the
  // build loudly (intended): a `.filter(t => t.name.charAt(0) === "a")`
  // whose predicate calls one of the gated methods now refuses the whole
  // loop with BF101 (via the shared `isSupported` predicate gate in
  // jsx-to-ir) rather than lowering to a broken `.CharAt` inside the
  // range. Pinning this so the loud-failure contract can't silently
  // regress back to the old emit-broken-template behaviour. (`charAt`
  // is a Tier C method that stays refused — earlier this test used
  // `startsWith`, which has since landed its Tier B lowering.)
  test('unsupported string method inside a .filter() predicate raises BF101', () => {
    const result = compileJSX(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string }[]>([])
  return <ul>{items().filter(t => t.name.charAt(0) === "a").map(t => <li key={t.name}>{t.name}</li>)}</ul>
}
`.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter() })
    expect(result.errors?.some(e => e.code === 'BF101')).toBe(true)
  })

  // The string-pattern form of `.replace` lowers (#1448 Tier B), but
  // the regex-pattern form stays refused with BF101 — the Perl `s///`
  // vs Go `regexp.ReplaceAllString` flavour gap is the open design
  // question. Pinning the refusal so the string-form lowering can't
  // accidentally start emitting a broken `.Replace` for the regex form.
  test('regex-pattern .replace raises BF101 (string-pattern form is lowered)', () => {
    const result = compileJSX(`
function C({ value }: { value: string }) {
  return <div>{value.replace(/o/g, "0")}</div>
}
export { C }
`.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter() })
    expect(result.errors?.some(e => e.code === 'BF101')).toBe(true)
    const template = result.files?.find(f => f.path.endsWith('.tmpl'))?.content ?? ''
    expect(template).not.toContain('.Replace')
  })

  // Tier B `.sort` / `.toSorted` follow-ups still refused with BF021.
  const unsupportedSort: Array<[string, string]> = [
    ['function-reference comparator', `items().toSorted(myCmp).map(x => <li key={x.name}>{x.name}</li>)`],
    ['localeCompare locale/options arg', `items().toSorted((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true })).map(x => <li key={x.name}>{x.name}</li>)`],
  ]
  for (const [label, chain] of unsupportedSort) {
    test(`sort follow-up (${label}): bare raises BF021, @client clears it`, () => {
      const bare = compileJSX(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string; n: number }[]>([])
  const myCmp = (a: { n: number }, b: { n: number }) => a.n - b.n
  return <ul>{${chain}}</ul>
}
`.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter() })
      expect(bare.errors?.some(e => e.code === 'BF021')).toBe(true)

      const guarded = emitLoop(chain, true)
      expect(guarded.errors).toEqual([])
      // Client-only loop → `{{bfComment "loop:lN"}}…{{bfComment "/loop:lN"}}`.
      expect(guarded.template).toMatch(/bfComment "loop:l\d+"/)
    })
  }

  // End-to-end proof via `go run`: the `@client` form renders a
  // `<!--bf-client:sN-->` placeholder. The bare form is now caught at
  // build with BF101 and degrades to an empty, render-safe slot (no
  // more `can't evaluate field …` crash), so we assert the build error
  // rather than a render crash. Skipped on hosts without Go.
  test('e2e: @client renders placeholder; bare is caught at build with BF101', async () => {
    // Uses the Tier C `charAt` (still refused) — earlier this test used
    // `repeat`, which has since landed its #1448 Tier B lowering.
    const bare = emit(`name().charAt(0)`, false)
    expect(bare.errors.some(e => e.code === 'BF101')).toBe(true)

    try {
      const html = await renderGoTemplateComponent({
        source: `
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [name, setName] = createSignal("hello")
  return <div>{/* @client */ name().charAt(0)}</div>
}
`.trimStart(),
        adapter: new GoTemplateAdapter(),
      })
      expect(html).toContain('<!--bf-client:s0-->')
    } catch (err) {
      if (err instanceof GoNotAvailableError) {
        console.log('Skipping #1448 @client e2e: go command not found')
        return
      }
      throw err
    }
  })
})

// =============================================================================
// #1966 — `/* @client */` defers ATTRIBUTE bindings (not just child/text)
// =============================================================================
//
// Before #1966 the directive was honoured for JSX child/text expressions
// but silently ignored on attribute initializers: a Go-unsupported
// predicate in `data-x={/* @client */ pred(x)}` still got lowered, raising
// BF101/BF102 even though the author had explicitly opted out of SSR. That
// made the BF102 remediation ("defer it with /* @client */") misleading for
// attribute-only reactive state (the Calendar case in #1467 / PR #1965).
//
// The fix carries the existing `attr.clientOnly` flag (already set in
// jsx-to-ir, already honoured by the client-JS reactive-attribute path —
// CSR template omits the attr and a mount effect sets it) through to the
// adapter: `renderAttributes` skips SSR emission for `clientOnly` attrs, so
// the unsupported-expression lowering is never reached.
describe('GoTemplateAdapter - #1966 @client defers attribute bindings', () => {
  function compileAttr(attrExpr: string) {
    const adapter = new GoTemplateAdapter()
    const result = compileJSX(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [sel] = createSignal(0)
  const [s] = createSignal("a")
  const pred = (n: number) => sel() === n
  return <div data-x={${attrExpr}}>hi</div>
}
`.trimStart(), 'test.tsx', { adapter })
    const template = result.files?.find(f => f.path.endsWith('.tmpl'))?.content ?? ''
    return { errors: result.errors ?? [], template }
  }

  test('Go-lowerable predicate: bare emits data-x; @client omits it from SSR', () => {
    // `sel() === 1` lowers to `{{eq .Sel 1}}`, so the bare form is valid
    // Go and emits the attribute — the directive is what removes it.
    const bare = compileAttr('pred(1)')
    expect(bare.errors).toEqual([])
    expect(bare.template).toContain('data-x=')

    const deferred = compileAttr('/* @client */ pred(1)')
    expect(deferred.errors).toEqual([])
    // Server omits the attribute; the client patches it on hydrate.
    expect(deferred.template).not.toContain('data-x')
  })

  test('Go-unsupported predicate: bare raises BF101; @client clears it and omits the attr', () => {
    const bare = compileAttr('/[0-9]/.test(s())')
    expect(bare.errors.some(e => e.code === 'BF101' || e.code === 'BF102')).toBe(true)

    const deferred = compileAttr('/* @client */ /[0-9]/.test(s())')
    // No BF101/BF102 — the lowering is never reached for a deferred attr.
    expect(deferred.errors).toEqual([])
    expect(deferred.template).not.toContain('data-x')
  })

  test('@client attribute inside a keyed .map() loop body is also deferred', () => {
    const adapter = new GoTemplateAdapter()
    const result = compileJSX(`
"use client"
import { createSignal } from "@barefootjs/client"
type Day = { n: number }
export function C() {
  const [sel] = createSignal(0)
  const pred = (d: Day) => sel() === d.n
  const days: Day[] = [{ n: 1 }, { n: 2 }]
  return (
    <div>
      {days.map((day: Day) => (
        <div key={day.n} data-x={/* @client */ pred(day)}>cell</div>
      ))}
    </div>
  )
}
`.trimStart(), 'test.tsx', { adapter })
    const template = result.files?.find(f => f.path.endsWith('.tmpl'))?.content ?? ''
    expect(result.errors ?? []).toEqual([])
    // The loop still renders (the array is a static const) but the deferred
    // attribute is absent from the emitted `<div>` cell.
    expect(template).toContain('range')
    expect(template).not.toContain('data-x')
  })
})
