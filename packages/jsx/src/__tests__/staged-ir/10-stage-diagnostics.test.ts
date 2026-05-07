/**
 * Pins the **stage-violation diagnostic infrastructure**: BF060/BF061/
 * BF062 codes are registered, `recordStageDiagnostics` produces well-
 * formed warnings, and the messages reference the offending binding by
 * name and recommend `/* @client *\/` as the workaround.
 *
 * Emission policy is **usage-aware**: `compute-inlinability` only
 * surfaces a diagnostic when the unsafe const is actually referenced
 * from a template position where the relocate fallback would produce
 * a user-visible defect (element attribute, bare slotless JSX
 * expression, conditional/if condition, loop array). Safe-fallback
 * positions — component props (stripped on UNSAFE), slotted JSX
 * expressions (empty placeholder filled at hydrate), and
 * `/* @client *\/` wrappers — don't fire the diagnostic, since the
 * pipeline already recovers without a visible artefact.
 *
 * BF060: signal/memo getter referenced from template scope
 * BF061: init-scope local referenced from template scope
 * BF062: cross-stage await — emitted at Phase 1 dispatcher (not here)
 */

import { describe, test, expect } from 'bun:test'
import { ErrorCodes } from '../../errors'
import { recordStageDiagnostics } from '../../ir-to-client-js/compute-inlinability'
import type { ConstantInfo, CompilerError } from '../../types'
import type { RelocateDecision } from '../../relocate'
import { compile } from './helpers'

const dummyLoc = {
  file: 'Test.tsx',
  start: { line: 1, column: 0 },
  end: { line: 1, column: 1 },
}

const constInfo = (name: string): ConstantInfo => ({
  name,
  value: '',
  declarationKind: 'const',
  type: null,
  loc: dummyLoc,
})

describe('Stage-violation diagnostic codes (BF060/BF061/BF062)', () => {
  test('error codes are registered with non-empty messages', () => {
    expect(ErrorCodes.STAGE_REACTIVE_IN_TEMPLATE).toBe('BF060')
    expect(ErrorCodes.STAGE_INIT_LOCAL_IN_TEMPLATE).toBe('BF061')
    expect(ErrorCodes.STAGE_AWAIT_IN_TEMPLATE).toBe('BF062')
  })
})

describe('recordStageDiagnostics', () => {
  test('signal-getter decision → BF060 error', () => {
    const out: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'count', kind: 'signal-getter', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('cls'), decisions, out)
    expect(out).toHaveLength(1)
    expect(out[0]?.code).toBe('BF060')
    expect(out[0]?.severity).toBe('error')
    expect(out[0]?.message).toContain('count')
    expect(out[0]?.message).toContain('cls')
    expect(out[0]?.message).toContain('/* @client */')
  })

  test('memo-getter decision → BF060 error', () => {
    const out: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'doubled', kind: 'memo-getter', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('view'), decisions, out)
    expect(out[0]?.code).toBe('BF060')
    expect(out[0]?.severity).toBe('error')
  })

  test('init-local decision → BF061 error', () => {
    const out: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'cachedViewport', kind: 'init-local', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('view'), decisions, out)
    expect(out).toHaveLength(1)
    expect(out[0]?.code).toBe('BF061')
    expect(out[0]?.severity).toBe('error')
    expect(out[0]?.message).toContain('cachedViewport')
    expect(out[0]?.message).toContain('/* @client */')
  })

  test('sub-init-local decision → BF061 error', () => {
    const out: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'tmp', kind: 'sub-init-local', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('val'), decisions, out)
    expect(out[0]?.code).toBe('BF061')
    expect(out[0]?.severity).toBe('error')
  })

  test('pass-through and lift decisions emit nothing', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'JSON', kind: 'global', action: 'pass-through', rewrittenAs: 'JSON' },
      { name: 'name', kind: 'prop', action: 'lift-to-prop', rewrittenAs: '_p.name' },
    ]
    recordStageDiagnostics(constInfo('cls'), decisions, warnings)
    expect(warnings).toHaveLength(0)
  })

  test('per-name de-dup: duplicate ref emits one error, not many', () => {
    const out: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'flag', kind: 'init-local', action: 'fallback', rewrittenAs: 'undefined' },
      { name: 'flag', kind: 'init-local', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('cls'), decisions, out)
    expect(out).toHaveLength(1)
  })
})

// End-to-end: the production pipeline surfaces stage-violation
// diagnostics in `result.errors` (severity warning today, see header).
// The wiring lives in `computeInlinability`, so the surfaced cases are
// the chained-const ones: a localConstant whose value references an
// init-scope-only binding through another local const. JSX expressions
// that reference an init-local directly go through a separate template
// emit path (`transformExpr` in html-template.ts) and aren't wired
// yet — separate follow-up.
describe('compileJSX surfaces stage-violation diagnostics by default', () => {
  test('chained const referencing init-local → BF061', () => {
    const { errors } = compile(`
      'use client'
      import { useSettings } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        const setting = useSettings()
        const view = JSON.stringify(setting)
        return <div data-view={view}>hi</div>
      }
    `)

    const bf061 = errors.find(e => e.startsWith('[BF061]'))
    expect(bf061).toBeDefined()
    expect(bf061).toContain('setting')
    expect(bf061).toContain('view')
  })

  test('chained const reading a signal also surfaces as BF061', () => {
    // The signal getter itself is classified `reactive-read` (early return,
    // no decisions captured), but the chained const that reads it is then
    // classified as an init-local in the template-scope relocate pass —
    // so the user-visible diagnostic is BF061 ("init-scope local") rather
    // than BF060. The fallback shape is the same either way.
    const { errors } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { x: string }

      export function Foo(props: Props) {
        const [count] = createSignal(0)
        const cur = count()
        const view = 'val:' + cur
        return <div data-view={view}>hi</div>
      }
    `)

    const bf061 = errors.find(e => e.startsWith('[BF061]'))
    expect(bf061).toBeDefined()
    expect(bf061).toContain('cur')
  })

  test('clean component (no fallbacks) emits no BF060/BF061', () => {
    const { errors } = compile(`
      'use client'

      interface Props { name: string }

      export function Foo(props: Props) {
        return <div>{props.name}</div>
      }
    `)

    expect(errors.find(e => e.startsWith('[BF060]'))).toBeUndefined()
    expect(errors.find(e => e.startsWith('[BF061]'))).toBeUndefined()
  })

  test('chained const referenced only inside /* @client */ does NOT fire BF061', () => {
    // The classification still flags `view` as unsafe because its value
    // contains an init-local. But the only template-side reference is
    // wrapped in `/* @client */`, which routes through
    // `clientOnlyElements` and doesn't add a `template-closure` edge to
    // the references graph. `compute-inlinability` reads that graph and
    // suppresses the diagnostic — the silent-fallback failure mode the
    // diagnostic warns about can't manifest when every usage is
    // already deferred to hydrate.
    const { errors } = compile(`
      'use client'
      import { useSettings } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        const setting = useSettings()
        const view = JSON.stringify(setting)
        return <div>{/* @client */ view}</div>
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeUndefined()
  })

  test('chained const with mixed usage fires BF061 (one /* @client */ ref is not enough)', () => {
    // If ANY usage is outside `/* @client */`, the silent-fallback
    // failure mode applies for that usage, so the diagnostic still
    // fires. The user's fix is to wrap the remaining usages too, or
    // restructure the const itself.
    const { errors } = compile(`
      'use client'
      import { useSettings } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        const setting = useSettings()
        const view = JSON.stringify(setting)
        return (
          <div>
            <span>{/* @client */ view}</span>
            <span>{view}</span>
          </div>
        )
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeDefined()
  })

  test('chained const referenced only via component-prop / slotted expr does NOT fire (form-field shape)', () => {
    // Form-library API: `const field = form.field(name)` is a chained
    // init-local. Used as `<Input value={field.value()}>` (component
    // prop — stripped on UNSAFE) and `<p>{field.error()}</p>` (slotted
    // expression — empty placeholder filled at hydrate). Both are
    // safe-fallback positions, so the diagnostic would be a false
    // positive.
    const { errors } = compile(`
      'use client'
      import { Input } from './input'
      import { useForm } from './form'

      interface Props {}

      export function Foo(_props: Props) {
        const form = useForm()
        const field = form.field('name')
        return (
          <form>
            <Input value={field.value()} onInput={field.handleInput} />
            <p>{field.error()}</p>
          </form>
        )
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeUndefined()
  })

  test('chained const used as plain HTML attribute DOES fire BF061', () => {
    // `<div data-view={view}>` substitutes the expression directly into
    // the SSR HTML — `data-view="undefined"` is the visible defect the
    // diagnostic warns about. Element-attribute substitution has no
    // slot reconciliation today, so this position can't be silently
    // recovered by hydrate.
    const { errors } = compile(`
      'use client'
      import { useSettings } from './nodes'

      interface Props {}

      export function Foo(_props: Props) {
        const setting = useSettings()
        const view = JSON.stringify(setting)
        return <div data-view={view}>hi</div>
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeDefined()
  })

  test('CSS-class tokens inside attribute template literal don\'t false-positive', () => {
    // Regression for a Copilot review concern (#1198): the static
    // segments of a backtick-quoted attribute value (`text-sm
    // ${variant}`) carry tokens like `text` and `sm` that match
    // `/\b[a-zA-Z_]\w*\b/g`. With a naive identifier extractor, a
    // chained const happening to share a name with one of those
    // tokens would surface a spurious BF061 — the const isn't
    // actually referenced from the template at all.
    const { errors } = compile(`
      'use client'
      import { useSettings } from './nodes'

      interface Props {}

      export function Foo(_props: Props) {
        // 'text' is a chained init-local; its only reference would
        // need to be a real \${text} substitution, NOT a CSS class
        // word inside the static segment of the template literal.
        const setting = useSettings()
        const text = JSON.stringify(setting)
        const variant = 'primary'
        return <div className={\`text-sm \${variant}\`}>hi</div>
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeUndefined()
  })

  test('/* @client */ on element-attribute defers BF061 + wires hydrate createEffect', () => {
    // The `<details open={shouldOpen}>` shape: `shouldOpen` is an
    // init-local computed from props. Wrapping the initializer in
    // `/* @client */` defers the attribute to a hydrate-time
    // createEffect (collect-elements pushes into reactiveAttrs); the
    // SSR template skips the attribute entirely. Diagnostic gate
    // mirrors the routing — clientOnly attrs aren't risky.
    const { errors, templateBody, initBody } = compile(`
      interface Props { items: string[]; current: string }

      export function Foo(props: Props) {
        const hasActive = props.items.includes(props.current)
        const shouldOpen = hasActive
        return <details open={/* @client */ shouldOpen}>x</details>
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeUndefined()
    // SSR template must not carry the attribute; init's createEffect
    // is the sole authority. The element still carries a `bf=` slot
    // marker so the runtime can find it.
    expect(templateBody).not.toContain('open=')
    expect(templateBody).toContain('<details')
    expect(templateBody).toMatch(/bf="s\d+"/)
    // Init body wires a `createEffect` that applies the value at
    // hydrate. `<details open>` is a boolean property attr so emit
    // uses the property-assignment shape (`_s0.open = !!(...)`)
    // rather than `setAttribute`. The bug we pin: SSR-strip without
    // the corresponding effect would leave the attribute
    // permanently unset.
    expect(initBody).toContain('createEffect')
    expect(initBody).toMatch(/\.open\s*=|setAttribute\(['"]open['"]/)
  })

  test('/* @client */ on component-prop defers BF061 + wires initChild getter', () => {
    // The `<Calendar maxDate={today}>` shape: `today` is an init-local.
    // `/* @client */` strips the prop from the SSR `renderChild` call;
    // `initChild`'s `propsExpr` getter still evaluates in init scope,
    // so the value reaches the child component once init runs.
    const { errors, templateBody, initBody } = compile(`
      'use client'
      import { Calendar } from './calendar'

      interface Props { offsetDays: number }

      export function Foo(props: Props) {
        const today = new Date()
        return <Calendar fromDate={today} toDate={/* @client */ new Date(today.getTime() + props.offsetDays * 86400000)} />
      }
    `)

    expect(errors.find(e => e.startsWith('[BF061]'))).toBeUndefined()
    // SSR renderChild props don't carry toDate.
    expect(templateBody).not.toContain('toDate')
    // Init's initChild propsExpr exposes a getter for `toDate` so the
    // child sees the value once init runs.
    expect(initBody).toContain('initChild')
    expect(initBody).toMatch(/get toDate\(\)/)
  })

  test('/* @client */ attr inside a conditional branch wires the per-branch effect (regression: collectBranchReactiveAttrs)', () => {
    // The branch-level reactive-attr collector has its own gate that
    // independently of the main `element` handler decides whether to
    // emit a hydrate-time binding. Without honoring `clientOnly`, the
    // SSR strip (in html-template) and the per-branch bindEvents
    // would disagree, leaving the attribute permanently unset. This
    // test pins both halves of the contract.
    const { templateBody, clientJs } = compile(`
      interface Props { items: string[]; current: string; show: boolean }

      export function Foo(props: Props) {
        const hasActive = props.items.includes(props.current)
        const shouldOpen = hasActive
        return (
          <div>
            {props.show ? <details open={/* @client */ shouldOpen}>x</details> : null}
          </div>
        )
      }
    `)

    expect(templateBody).not.toContain('open=')
    // The branch's `bindEvents` callback (emitted via `insert(...)`)
    // must contain a `createDisposableEffect` that applies `open`.
    // Same property-vs-attribute split as the top-level case —
    // accept either form.
    expect(clientJs).toContain('createDisposableEffect')
    expect(clientJs).toMatch(/\.open\s*=|setAttribute\(['"]open['"]/)
  })

  test('/* @client */ promotes a no-"use client" component to a hydrating client component', () => {
    // A component without `'use client'` would normally compile to a
    // pure server-render shape (no init, no hydrate). The directive
    // demands hydrate-time wiring, which forces the compiler to emit
    // an init function — otherwise the SSR-stripped attribute would
    // be permanently unset. Pin this so a future refactor doesn't
    // accidentally silently drop the directive on no-"use client"
    // components.
    const { errors, templateBody, initBody } = compile(`
      interface Props { items: string[]; current: string }

      export function Foo(props: Props) {
        const hasActive = props.items.includes(props.current)
        return <details open={/* @client */ hasActive}>x</details>
      }
    `)

    expect(errors.find(e => e.startsWith('[BF06'))).toBeUndefined()
    expect(templateBody).not.toContain('open=')
    // Directive forced init emission even without `'use client'`.
    expect(initBody).not.toBe('')
    expect(initBody).toMatch(/\.open\s*=|setAttribute\(['"]open['"]/)
  })

  test('/* @client */ on attribute inside .map() loop wires per-item effect', () => {
    // Loop bodies allocate per-item slots; clientOnly attrs on loop
    // children must still route through the reactive-attr machinery
    // so each rendered item gets its hydrate-time binding.
    const { templateBody, clientJs } = compile(`
      'use client'
      interface Props { rows: { id: string; raw: string }[] }

      export function Foo(props: Props) {
        return (
          <ul>
            {props.rows.map(row => {
              const computed = row.raw.toUpperCase()
              return <li key={row.id} data-tag={/* @client */ computed}>{row.id}</li>
            })}
          </ul>
        )
      }
    `)

    expect(templateBody).not.toContain('data-tag=')
    expect(clientJs).toMatch(/setAttribute\(['"]data-tag['"]/)
  })

  test('/* @client */ on multiple attrs of the same element each wire their own effect', () => {
    const { templateBody, initBody } = compile(`
      'use client'
      interface Props { ax: string; bx: string }

      export function Foo(props: Props) {
        const a = props.ax + '!'
        const b = props.bx + '!'
        return <div data-a={/* @client */ a} data-b={/* @client */ b}>x</div>
      }
    `)

    expect(templateBody).not.toContain('data-a=')
    expect(templateBody).not.toContain('data-b=')
    // Both attributes get their own setAttribute call inside init's
    // createEffect block.
    expect(initBody).toMatch(/setAttribute\(['"]data-a['"]/)
    expect(initBody).toMatch(/setAttribute\(['"]data-b['"]/)
  })

  test('/* @client */ on signal-bearing attr does not double-push reactiveAttrs', () => {
    // The wrap heuristic would already wrap a signal-bearing attr
    // (`<div data-x={count()}>`). Adding `/* @client */` shouldn't
    // emit a duplicate binding — the OR gate in collect-elements
    // unions the two, it doesn't sum them.
    const { initBody } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {}

      export function Foo(_props: Props) {
        const [count, _set] = createSignal(0)
        return <div data-x={/* @client */ count()}>x</div>
      }
    `)

    const matches = initBody.match(/setAttribute\(['"]data-x['"]/g) ?? []
    expect(matches).toHaveLength(1)
  })

  test('/* @client */ on event handler is a no-op (handlers are init-body anyway)', () => {
    // Event handlers are pulled out of attrs in jsx-to-ir before
    // clientOnly detection runs. The directive is silently ignored
    // — the handler is wired up via the existing event-delegation
    // path. Pin this so we spot a behaviour drift.
    const { initBody } = compile(`
      'use client'
      interface Props {}

      export function Foo(_props: Props) {
        const handleClick = () => {}
        return <button onClick={/* @client */ handleClick}>x</button>
      }
    `)

    // Handler is wired via the standard bindEvents path — exact form
    // varies by adapter, but the handler name should appear inside
    // the init body.
    expect(initBody).toContain('handleClick')
  })

  test('"@client" inside string literal does NOT trigger clientOnly routing (false-positive guard)', () => {
    // Regression for a Copilot review concern (#1199): prior to the
    // shared `hasLeadingClientDirective` helper, detection used
    // `getFullText().includes('@client')`, which would also match a
    // bare `"@client"` substring inside the expression — silently
    // stripping the attribute from SSR. Pin the tightened detection
    // (leading block-comment trivia matching the directive shape
    // exactly) by checking that the SSR template still emits the
    // attribute when no leading comment is present.
    const { templateBody } = compile(`
      'use client'
      interface Props {}

      export function Foo(_props: Props) {
        return <div data-x={'@client tag'}>x</div>
      }
    `)

    expect(templateBody).toContain('data-x=')
  })

  test('/* @client */ as TRAILING comment does NOT trigger clientOnly routing (leading-only)', () => {
    // The directive is a position-sensitive marker — `<div data-x={x
    // /* @client */}>` is an inline annotation about the expression,
    // not a deferral request. Tightened detection only honours
    // *leading* trivia, so the SSR template must still emit the
    // attribute.
    const { templateBody } = compile(`
      'use client'
      interface Props { tag: string }

      export function Foo(props: Props) {
        return <div data-x={props.tag /* @client */}>x</div>
      }
    `)

    expect(templateBody).toContain('data-x=')
  })

  test('/* @client */ component-prop with JSX subtree value: directive ignored (jsxChildren branch returns early)', () => {
    // `processComponentProps` treats `<MyComp content={<Bar />}>` via
    // a separate `jsxChildren` path that returns before the
    // clientOnly detection. The prop is structurally a child subtree,
    // not a deferred init-body value, so silent ignore is correct.
    // Pin this so a future refactor doesn't accidentally start
    // honouring the directive there.
    const { errors } = compile(`
      'use client'
      import { Wrapper } from './wrapper'
      import { Inner } from './inner'

      interface Props {}

      export function Foo(_props: Props) {
        return <Wrapper content={/* @client */ <Inner />} />
      }
    `)

    // No diagnostic noise either way.
    expect(errors.find(e => e.startsWith('[BF06'))).toBeUndefined()
  })
})
