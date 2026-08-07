/**
 * BarefootJS JSX Adapter Base Class
 *
 * Shared logic for JSX-based template adapters (Hono, Test, etc.).
 * Provides SSR signal initializers, import formatting, and hydration markers.
 */

import type {
  AttrValue,
  ComponentIR,
  IRNode,
  IRTemplatePart,
  ImportSpecifier,
} from '../types.ts'
import { templatePartsToJsExpr } from '../template-parts.ts'
import { BF_SCOPE, BF_SLOT, BF_COND } from '@barefootjs/shared'
import { BaseAdapter } from './interface.ts'
import type { CallbackBodyAcceptor } from './interface.ts'
import { ENV_SIGNAL_CLIENT_FACTORY } from './env-signal.ts'
import { formatParamWithType, findReachableNames } from '../module-exports.ts'

export interface JsxAdapterConfig {
  /** Use typed versions (typedInitialValue, etc.) for type-safe .tsx output */
  preserveTypes: boolean
}

export abstract class JsxAdapter extends BaseAdapter {
  protected componentName: string = ''

  /** Subclasses define whether to use typed values for type-safe output */
  protected abstract jsxConfig: JsxAdapterConfig

  /**
   * JS-runtime adapters (Hono SSR, CSR, the test adapter) render an off-subset
   * callback body by running it verbatim, so the compiler need not raise a
   * universal Phase-1 diagnostic for a `filter`/`sort`/… body it can't lower.
   * DSL adapters extend `BaseAdapter` and leave this undefined.
   * See `spec/callback-fidelity.md`.
   */
  acceptsCallbackBody: CallbackBodyAcceptor = () => true

  // ===========================================================================
  // Import Formatting
  // ===========================================================================

  protected formatImportSpecifiers(
    specifiers: ImportSpecifier[]
  ): string {
    const defaultSpec = specifiers.find((s) => s.isDefault)
    const namespaceSpec = specifiers.find((s) => s.isNamespace)
    const namedSpecs = specifiers.filter((s) => !s.isDefault && !s.isNamespace)

    const parts: string[] = []

    if (defaultSpec) {
      parts.push(defaultSpec.alias || defaultSpec.name)
    }

    if (namespaceSpec) {
      parts.push(`* as ${namespaceSpec.name}`)
    }

    if (namedSpecs.length > 0) {
      const named = namedSpecs
        .map((s) => (s.alias ? `${s.name} as ${s.alias}` : s.name))
        .join(', ')
      parts.push(`{ ${named} }`)
    }

    return parts.join(', ')
  }

  // ===========================================================================
  // SSR Signal Initializers
  // ===========================================================================

  /**
   * Generate SSR no-op initializers for signals, memos, constants, and
   * functions. Performs transitive dependency analysis to skip
   * unreachable declarations.
   *
   * Public (and contracted at the `TemplateAdapter` level as an
   * optional method) since #1290 step 3: the divergence between
   * JS-runtime adapters (which implement this) and DSL adapters
   * (which leave it `undefined`) is now type-visible instead of
   * hidden inside the `JsxAdapter` inheritance branch.
   */
  generateSignalInitializers(ir: ComponentIR, jsxBody: string): string {
    const lines: string[] = []
    const { preserveTypes } = this.jsxConfig

    // Build primary reference text for reachability analysis:
    // jsxBody + signal initial values + memo computations (these are the "consumers")
    const primaryRefs = [jsxBody]
    for (const signal of ir.metadata.signals) {
      if (signal.isModule) continue
      primaryRefs.push(signal.initialValue)
    }
    for (const memo of ir.metadata.memos) {
      if (memo.isModule) continue
      primaryRefs.push(memo.computation)
    }
    const primaryRefText = primaryRefs.join('\n')

    // Collect local declarations and their bodies for dependency analysis
    const localFunctions = ir.metadata.localFunctions.filter(f => !f.isExported)
    const localConstants = ir.metadata.localConstants.filter(c => !c.isExported && c.value)
    const declarations = [
      ...localFunctions.map(f => ({ name: f.name, body: f.body })),
      ...localConstants.map(c => ({ name: c.name, body: c.value! })),
    ]

    // Find reachable declarations via transitive dependency analysis
    const reachable = findReachableNames(primaryRefText, declarations)

    // Also check which signal setters are referenced
    const reachableBodies = [...reachable].map(name => {
      const func = localFunctions.find(f => f.name === name)
      if (func) return func.body
      const constant = localConstants.find(c => c.name === name)
      return constant?.value ?? ''
    }).join('\n')
    const setterRefText = primaryRefText + '\n' + reachableBodies

    for (const signal of ir.metadata.signals) {
      if (signal.isModule) continue
      if (signal.envReader) {
        // Env signal (#2057): call the real runtime factory so SSR resolves the
        // request query through the installed server env reader, not a static
        // initial value. Emit the factory as written (alias / namespace aware),
        // matching the import re-emitted into the SSR module; fall back to the
        // canonical name if the callee text wasn't captured.
        const factory = signal.envFactory ?? ENV_SIGNAL_CLIENT_FACTORY[signal.envReader]
        if (factory) {
          lines.push(
            signal.setter
              ? `  const [${signal.getter}, ${signal.setter}] = ${factory}()`
              : `  const [${signal.getter}] = ${factory}()`,
          )
        }
        continue
      }
      // Create a getter that returns the initial value for SSR
      const rawInitialValue = preserveTypes
        ? (signal.typedInitialValue ?? signal.initialValue)
        : signal.initialValue
      const initialValue = rawInitialValue.trim().startsWith('{') ? `(${rawInitialValue})` : rawInitialValue

      // When preserveTypes and typedInitialValue is absent but signal.type has a meaningful
      // type from a generic parameter, add a type assertion to prevent TS inference issues.
      // A bare `object` raw is the analyzer's coarse KIND, not a real type — asserting
      // `as object` only destroys the initializer's inferred literal type (a
      // `{ x: 0, y: 0 }` signal getter stops matching `() => { x: number; y: number }`).
      const needsTypeAssertion = preserveTypes
        && !signal.typedInitialValue
        && signal.type.kind !== 'unknown'
        && signal.type.kind !== 'primitive'
        && signal.type.raw !== 'object'
      if (needsTypeAssertion) {
        lines.push(`  const ${signal.getter} = () => ${initialValue} as ${signal.type.raw}`)
      } else {
        lines.push(`  const ${signal.getter} = () => ${initialValue}`)
      }

      // Create a no-op setter for SSR — omit entirely if not referenced anywhere
      if (signal.setter) {
        const setterUsed = new RegExp(`\\b${signal.setter}\\b`).test(setterRefText)
        if (setterUsed) {
          lines.push(`  const ${signal.setter} = (..._args: any[]) => {}`)
        }
      }
    }

    for (const memo of ir.metadata.memos) {
      if (memo.isModule) continue
      // Evaluate memo computation at SSR time
      const computation = preserveTypes
        ? (memo.typedComputation ?? memo.computation)
        : memo.computation
      lines.push(`  const ${memo.name} = ${computation}`)
    }

    // Include local constants — skip unreachable ones (only used in event
    // handlers). Genuinely module-scope constants are NOT localised here:
    // they're emitted at module scope by `generateModuleScopeDeclarations`
    // so module-scope types that reference them (via `typeof`) keep
    // resolving, matching the client bundle's `emitModuleLevelDeclarations`
    // (#2570). `moduleScopeDeclarationNames` — not the raw `isModule` flag
    // — decides the split; see its docstring.
    const moduleScopeNames = this.moduleScopeDeclarationNames(ir)
    for (const constant of ir.metadata.localConstants) {
      if (constant.isExported) continue
      if (moduleScopeNames.has(constant.name)) continue
      const keyword = constant.declarationKind ?? 'const'
      if (!constant.value) {
        lines.push(`  ${keyword} ${constant.name}`)
        continue
      }
      const value = constant.value.trim()
      // Skip client-only constructs in SSR:
      // - createContext() — only used client-side via provideContext/useContext
      // - new WeakMap() — client-side cross-component shared state
      if (/^createContext\b/.test(value) || /^new WeakMap\b/.test(value)) continue

      // Skip unreachable constants (only used in event handler code paths)
      if (!reachable.has(constant.name)) continue

      const constValue = preserveTypes
        ? (constant.typedValue ?? constant.value)
        : constant.value
      lines.push(`  ${keyword} ${constant.name} = ${constValue}`)
    }

    // Include local functions — skip unreachable ones (only used in event
    // handlers). Genuinely module-scope functions stay at module scope,
    // same as constants above.
    for (const func of localFunctions) {
      if (moduleScopeNames.has(func.name)) continue
      if (!reachable.has(func.name)) continue
      // Prefer the source-verbatim signature when types are preserved so
      // type-predicate annotations (`element is { tag: unknown; … }`) and
      // explicit `:unknown` parameter annotations survive into the emit.
      // See FunctionInfo.typedParams docstring (#1453).
      const params = preserveTypes && func.typedParams !== undefined
        ? func.typedParams
        : func.params.map(formatParamWithType).join(', ')
      const returnAnnotation = preserveTypes && func.typedReturnType
        ? `: ${func.typedReturnType}`
        : ''
      const body = preserveTypes
        ? (func.typedBody ?? func.body)
        : func.body
      const asyncKw = func.isAsync ? 'async ' : ''
      lines.push(`  ${asyncKw}function ${func.name}(${params})${returnAnnotation} ${body}`)
    }

    return lines.join('\n')
  }

  // ===========================================================================
  // Module-Scope Declarations
  // ===========================================================================

  /**
   * Names that genuinely live at module scope in the emitted template.
   *
   * The analyzer's `isModule` flag is NOT a lexical-scope oracle: the
   * module walker recurses into component bodies, so a component-body
   * helper (calendar's `renderMonthGrid`, xyflow's edge handlers) can
   * carry `isModule: true` while closing over component state. Hoisting
   * such a helper breaks every reference (TS2304/TS2552 — and worse,
   * wrong runtime scope). So candidates are demoted by a forward-
   * reachability fixpoint, mirroring the client bundle's
   * `computeDeclarationScopes` (`ir-to-client-js/compute-scope.ts`): a
   * candidate whose emitted text references component scope — a signal
   * getter/setter, a memo, a prop, a body const/function, or an already-
   * demoted candidate — is component-scoped, transitively. Genuinely
   * module-level declarations cannot reference component scope, so the
   * fixpoint only ever demotes the mis-flagged.
   *
   * Memoized per IR: `generateModuleScopeDeclarations` (module emission)
   * and `generateSignalInitializers` (body emission) must agree on the
   * split or a declaration is emitted twice or not at all.
   */
  private readonly moduleScopeNamesCache = new WeakMap<ComponentIR, Set<string>>()

  protected moduleScopeDeclarationNames(ir: ComponentIR): Set<string> {
    const cached = this.moduleScopeNamesCache.get(ir)
    if (cached) return cached

    const { preserveTypes } = this.jsxConfig
    const componentScope = new Set<string>()
    for (const sig of ir.metadata.signals) {
      if (sig.isModule) continue
      componentScope.add(sig.getter)
      if (sig.setter) componentScope.add(sig.setter)
    }
    for (const memo of ir.metadata.memos) {
      if (!memo.isModule) componentScope.add(memo.name)
    }
    for (const p of ir.metadata.propsParams) componentScope.add(p.name)
    if (ir.metadata.propsObjectName) componentScope.add(ir.metadata.propsObjectName)
    if (ir.metadata.restPropsName) componentScope.add(ir.metadata.restPropsName)
    for (const c of ir.metadata.localConstants) {
      if (!c.isModule) componentScope.add(c.name)
    }
    for (const f of ir.metadata.localFunctions) {
      if (!f.isModule) componentScope.add(f.name)
    }

    const candidates = new Map<string, string>()
    for (const c of ir.metadata.localConstants) {
      if (!c.isModule) continue
      // JSX-valued consts are inlined at their usage sites at IR level
      // (#547/#569) — same skip as the client's `classifyConstant`.
      if (c.isJsx || c.isJsxFunction) continue
      candidates.set(c.name, (preserveTypes ? (c.typedValue ?? c.value) : c.value) ?? '')
    }
    for (const f of ir.metadata.localFunctions) {
      if (!f.isModule) continue
      // JSX-returning helpers (single- and multi-return) are inlined at
      // their call sites (#569/#932); emitting them too would resurrect
      // them as dead module-scope declarations — and the multi-return
      // bodies carry raw source JSX that must not reach the template
      // verbatim. Same skips as the client's `computeDeclarationScopes`.
      if (f.isJsxFunction || f.isMultiReturnJsxHelper) continue
      const body = preserveTypes ? (f.typedBody ?? f.body) : f.body
      candidates.set(f.name, body)
    }

    // `$` is a legal identifier character but not a `\\w` one, so plain
    // `\\b` boundaries misfire around `$`-named bindings — use the same
    // escaped lookaround idiom as the analyzer's branch-substitution
    // rewriter (`(?<![\\w$])name(?![\\w$])`).
    const escapeForRegex = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const referencesAny = (text: string, names: ReadonlySet<string>): boolean => {
      for (const name of names) {
        if (new RegExp(`(?<![\\w$])${escapeForRegex(name)}(?![\\w$])`).test(text)) return true
      }
      return false
    }
    let changed = true
    while (changed) {
      changed = false
      for (const [name, text] of candidates) {
        if (referencesAny(text, componentScope)) {
          candidates.delete(name)
          componentScope.add(name)
          changed = true
        }
      }
    }

    const result = new Set(candidates.keys())
    this.moduleScopeNamesCache.set(ir, result)
    return result
  }

  /**
   * Module-scope type, constant, and function declarations for the
   * emitted template, kept at MODULE scope in SOURCE ORDER — the emitted
   * module preserves the source module's shape, as the client bundle
   * already does (`emitModuleLevelDeclarations` in `ir-to-client-js`).
   * Root cure for the #2570 family: type declarations are re-emitted
   * verbatim at module scope, so any value they reference through
   * `typeof` (a type alias's `keyof typeof strokePaths`, a props
   * annotation's `keyof typeof modes`) must be declared there too.
   * Localising those values into each component body — the previous
   * shape — failed the query with TS2304, and an unresolved
   * `keyof typeof` degrades to `keyof any`, silently widening the type
   * to `string | number | symbol` and taking every downstream check
   * with it.
   *
   * EXPORTED module declarations are emitted here too (with their
   * `export` keyword), interleaved with the non-exported ones in source
   * order — not split off to `generateModuleExports`' section, which is
   * emitted after this one and so would put an exported const AFTER a
   * non-exported const that reads it (input-otp's `patternPresets`
   * reading `REGEXP_ONLY_DIGITS`): a module-load TDZ crash, not just
   * TS2448. The compiler skips value declarations in
   * `generateModuleExports` when `moduleConstantsIncludeExports` is set
   * on the sections.
   *
   * Emission is deliberately UNFILTERED by per-component reachability: an
   * unused module declaration in the emitted template is harmless and
   * matches the source module. In a multi-component file each component's
   * adapter output carries its own block (the analyzer collects the module
   * declarations lexically preceding the component, so blocks can be
   * unequal prefixes); the compiler merges them with top-level-STATEMENT
   * dedup, so shared declarations land exactly once in source order.
   *
   * `new WeakMap()` bindings stay client-only, and exported
   * `createContext()` bindings stay unemitted, exactly as before.
   */
  protected generateModuleScopeDeclarations(ir: ComponentIR): string {
    const { preserveTypes } = this.jsxConfig
    const moduleNames = this.moduleScopeDeclarationNames(ir)
    const entries: Array<{ line: number, text: string }> = []

    for (const t of ir.metadata.typeDefinitions) {
      entries.push({ line: t.loc.start.line, text: t.definition })
    }

    for (const c of ir.metadata.localConstants) {
      if (!c.isModule || !moduleNames.has(c.name)) continue
      const keyword = c.declarationKind ?? 'const'
      const exportKw = c.isExported ? 'export ' : ''
      if (!c.value) {
        entries.push({ line: c.loc.start.line, text: `${exportKw}${keyword} ${c.name}` })
        continue
      }
      const trimmed = c.value.trim()
      if (/^new WeakMap\b/.test(trimmed)) continue
      if (c.isExported && /^createContext\b/.test(trimmed)) continue
      const value = preserveTypes ? (c.typedValue ?? c.value) : c.value
      entries.push({ line: c.loc.start.line, text: `${exportKw}${keyword} ${c.name} = ${value}` })
    }

    for (const f of ir.metadata.localFunctions) {
      if (!f.isModule || !moduleNames.has(f.name)) continue
      const params = preserveTypes && f.typedParams !== undefined
        ? f.typedParams
        : f.params.map(formatParamWithType).join(', ')
      const returnAnnotation = preserveTypes && f.typedReturnType
        ? `: ${f.typedReturnType}`
        : ''
      const body = preserveTypes ? (f.typedBody ?? f.body) : f.body
      const asyncKw = f.isAsync ? 'async ' : ''
      const exportKw = f.isExported ? 'export ' : ''
      entries.push({
        line: f.loc.start.line,
        text: `${exportKw}${asyncKw}function ${f.name}(${params})${returnAnnotation} ${body}`,
      })
    }

    entries.sort((a, b) => a.line - b.line)
    return entries.map(e => e.text).join('\n')
  }

  // ===========================================================================
  // Raw Node Rendering
  // ===========================================================================

  protected renderNodeRaw(node: IRNode): string {
    if (node.type === 'expression') {
      if (node.expr === 'null' || node.expr === 'undefined') {
        return 'null'
      }
      return node.expr
    }
    return this.renderNode(node)
  }

  // ===========================================================================
  // Template Part Rendering
  // ===========================================================================

  /**
   * Render a structured `template` variant's parts as JS template-literal
   * source for this adapter's .tsx output, carrying the `preserveTypes`
   * index annotation on inlined `lookup` records (#2565 — see
   * `lookupPartToJsExpr`).
   */
  protected renderTemplatePartsAsJs(parts: readonly IRTemplatePart[]): string {
    return templatePartsToJsExpr(parts, { typed: this.jsxConfig.preserveTypes })
  }

  /**
   * The JS source for an `expression` attribute / component-prop value.
   *
   * A component-prop `template` is collapsed into an `expression` at IR
   * construction time (component props are runtime values, not HTML
   * attribute bodies), which drops it out of `renderTemplatePartsAsJs`'s
   * reach — the same inlined-record index, minus the type annotation
   * (#2565). The collapse keeps its `parts`, so re-render from those when
   * `expr` is still EXACTLY the neutral collapse. Any later rewrite of
   * `expr` (a presence peel, a prop-ref rewrite) fails the identity check
   * and wins, so this can only ever add the annotation, never undo a
   * downstream edit.
   */
  protected expressionValueToJs(value: Extract<AttrValue, { kind: 'expression' }>): string {
    if (
      this.jsxConfig.preserveTypes &&
      value.parts &&
      value.expr === templatePartsToJsExpr(value.parts)
    ) {
      return this.renderTemplatePartsAsJs(value.parts)
    }
    return value.expr
  }

  // ===========================================================================
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(instanceIdExpr: string): string {
    return `${BF_SCOPE}={${instanceIdExpr}}`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }
}
