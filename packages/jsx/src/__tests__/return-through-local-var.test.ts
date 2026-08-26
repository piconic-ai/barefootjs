/**
 * Regression tests for #2720: a component whose render is bound to a local
 * const and returned by name —
 *
 *   export function Button() {
 *     const __root = (<button>Go</button>)
 *     return __root
 *   }
 *
 * — previously produced `{files: [], errors: []}`: neither sound (nothing
 * emitted) nor loud (nothing reported). Two structural variants of this
 * shape need two separate detectors, both landing here:
 *
 * 1. **Flat** (statements are direct children of the component body, as
 *    written above): `ctx.jsxReturn` DOES get set (to the `__root`
 *    Identifier — `visitComponentBody`'s return handler captures any
 *    return expression, not just syntactic JSX), but return position never
 *    resolves an identifier through its initializer the way JSX-child
 *    position does via `jsxConstants` / `inlineableJsxConsts` (#547 /
 *    #1409) — so `transformJsxExpression`'s scalar-leaf case returns `null`
 *    and `buildIRRoot` (`jsx-to-ir.ts`) drops the component silently. Fixed
 *    there: recognize a bare Identifier at return position that names a
 *    local already proven to hold JSX by those two maps, and report BF027
 *    instead of dropping it.
 *
 * 2. **Nested-block** (`{ const __root = <jsx/>; return __root }` as a
 *    single block statement — the exact shape the #2481 mutation sweep's
 *    `block-body` mutation produces by wrapping the ORIGINAL return
 *    statement): the block is a direct child of the component body, so
 *    `visitComponentBody`'s opaque-block preservation (#930 — "a bare
 *    block at the top of a component body is inert side-effect scoping,
 *    preserve it verbatim, don't recurse") swallows it whole. Neither
 *    `jsxConstants` nor `jsxReturn` are EVER set, so the flat-case fix
 *    above never runs. Fixed in `analyzer.ts`'s `visitComponentBody`:
 *    before preserving such a block, `findBlockBodyReturnedJsxLocalName`
 *    checks whether it is exactly this "name the JSX, then return the
 *    name" shape and reports BF027 directly.
 *
 * The "faithful" fix (resolving the identifier through its initializer so
 * the component actually compiles, for either variant) is tracked
 * separately by #2720 and not implemented here — this PR is the loud
 * stopgap only.
 *
 * Found by the #2481 mutation sweep's `block-body` mutation
 * (`packages/adapter-tests/mutation/mutations.ts`, the nested-block shape
 * above): 41/41 corpus fixtures reproduced this identically before this
 * fix, classified `broken` with `refused` at 0. This fix flips them to
 * `refused` (a pass under the sound-or-loud trichotomy).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('BF027: return-through-local-variable is not recognized as JSX (#2720)', () => {
  test('function component: `const __root = (<jsx/>); return __root` reports BF027 instead of silently emitting nothing', () => {
    const source = `
      export function Button() {
        const __root = (<button>Go</button>)
        return __root
      }
    `
    const result = compileJSX(source, 'Button.tsx', { adapter })

    // Neither silent-drop nor silent-emit: no files, but a loud diagnostic.
    expect(result.files).toHaveLength(0)
    const bf027 = result.errors.find(e => e.code === 'BF027')
    expect(bf027).toBeDefined()
    expect(bf027!.severity).toBe('error')
    expect(bf027!.message).toContain('Button')
    expect(bf027!.message).toMatch(/not recognized as JSX/)
  })

  test('arrow component: same shape via `export const Button = () => {...}`', () => {
    const source = `
      export const Button = () => {
        const __root = <button>Go</button>
        return __root
      }
    `
    const result = compileJSX(source, 'Button.tsx', { adapter })
    expect(result.files).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF027')).toBeDefined()
  })

  test('non-root JSX initializer (ternary) through a local also reports BF027', () => {
    const source = `
      export function Button({ ok }: { ok: boolean }) {
        const __root = ok ? <button>Go</button> : <span>No</span>
        return __root
      }
    `
    const result = compileJSX(source, 'Button.tsx', { adapter })
    expect(result.files).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF027')).toBeDefined()
  })

  test('nested-block shape (the actual mutation-sweep output): `{ const __root = <jsx/>; return __root }` reports BF027', () => {
    // This is the shape `packages/adapter-tests/mutation/mutations.ts`'s
    // `blockBody` mutation actually produces (it wraps the ORIGINAL return
    // statement in a new block rather than splicing the const/return in as
    // top-level statements) — structurally distinct from the flat case
    // above because the block is opaque to `visitComponentBody` (#930).
    const source = `
      export function Button() {
        {
          const __root = <button>Go</button>
          return __root
        }
      }
    `
    const result = compileJSX(source, 'Button.tsx', { adapter })
    expect(result.files).toHaveLength(0)
    const bf027 = result.errors.find(e => e.code === 'BF027')
    expect(bf027).toBeDefined()
    expect(bf027!.message).toContain('Button')
  })

  test('nested-block shape with a ternary JSX initializer also reports BF027', () => {
    const source = `
      export function Button({ ok }: { ok: boolean }) {
        {
          const __root = ok ? <button>Go</button> : <span>No</span>
          return __root
        }
      }
    `
    const result = compileJSX(source, 'Button.tsx', { adapter })
    expect(result.files).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF027')).toBeDefined()
  })

  test('multi-component file: the broken sibling is flagged but the good sibling still compiles', () => {
    const source = `
      export function Good() { return <div>ok</div> }
      export function Bad() {
        const __root = <button>Go</button>
        return __root
      }
    `
    const result = compileJSX(source, 'Multi.tsx', { adapter })
    const bf027 = result.errors.find(e => e.code === 'BF027')
    expect(bf027).toBeDefined()
    expect(bf027!.message).toContain('Bad')
    // Good still produces output despite Bad's failure.
    expect(result.files.length).toBeGreaterThan(0)
  })

  describe('control: direct JSX return keeps compiling clean', () => {
    test('function component returning JSX directly has no BF027 and produces files', () => {
      const source = `
        export function Button() {
          return (<button>Go</button>)
        }
      `
      const result = compileJSX(source, 'Button.tsx', { adapter })
      expect(result.errors.find(e => e.code === 'BF027')).toBeUndefined()
      expect(result.files.length).toBeGreaterThan(0)
    })
  })

  describe('no false positive: PascalCase exports that legitimately do not return JSX stay silent', () => {
    test('a PascalCase function returning a plain object is untouched (not a component at all)', () => {
      const source = `
        export function CreateUser() {
          return { name: 'x' }
        }
      `
      const result = compileJSX(source, 'CreateUser.tsx', { adapter })
      // Pre-existing behaviour for a non-component PascalCase export:
      // no files, no errors. BF027 must not fire here — there is no local
      // proven to hold JSX anywhere in this function.
      expect(result.files).toHaveLength(0)
      expect(result.errors.find(e => e.code === 'BF027')).toBeUndefined()
    })

    test('render-nothing literals (null / <></> / false) returned directly stay clean', () => {
      const source = `
        export function ReturnsNull() { return null }
        export function ReturnsFragment() { return <></> }
        export function ReturnsFalse(): any { return false }
      `
      const result = compileJSX(source, 'ReturnsNull.tsx', { adapter })
      expect(result.errors.find(e => e.code === 'BF027')).toBeUndefined()
    })

    test('a local const unrelated to JSX does not spuriously trip BF027', () => {
      const source = `
        export function Button() {
          const count = 1
          return <button>{count}</button>
        }
      `
      const result = compileJSX(source, 'Button.tsx', { adapter })
      expect(result.errors.find(e => e.code === 'BF027')).toBeUndefined()
      expect(result.files.length).toBeGreaterThan(0)
    })

    test('an ordinary top-level scoping block with no returned local is untouched', () => {
      // A bare block used for legitimate imperative scoping ahead of the
      // real render — #930's opaque-block preservation path — must not be
      // mistaken for the #2720 shape just because SOME block sits at the
      // top of the component body.
      const source = `
        export function Button() {
          {
            const x = 1
            console.log(x)
          }
          return <button>Go</button>
        }
      `
      const result = compileJSX(source, 'Button.tsx', { adapter })
      expect(result.errors.find(e => e.code === 'BF027')).toBeUndefined()
      expect(result.files.length).toBeGreaterThan(0)
    })

    test('a nested block whose returned identifier is not locally JSX-initialized stays silent', () => {
      // The block's last statement returns `result`, but nothing in the
      // block declares `result` as JSX — e.g. it is a prop or an outer
      // local. Must not false-positive just because the shape ends in
      // `return <identifier>`.
      const source = `
        export function Widget({ result }: { result: number }) {
          {
            const other = 1
            return result
          }
        }
      `
      const compileResult = compileJSX(source, 'Widget.tsx', { adapter })
      expect(compileResult.errors.find(e => e.code === 'BF027')).toBeUndefined()
    })
  })
})
