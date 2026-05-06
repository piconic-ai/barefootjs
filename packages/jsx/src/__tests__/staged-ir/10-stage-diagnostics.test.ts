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
})
