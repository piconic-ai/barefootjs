/**
 * BarefootJS JSX Adapter Base Class
 *
 * Shared logic for JSX-based template adapters (Hono, Test, etc.).
 * Provides SSR signal initializers, import formatting, and hydration markers.
 */

import type {
  ComponentIR,
  IRNode,
  ImportSpecifier,
} from '../types'
import { BaseAdapter } from './interface'
import { formatParamWithType, findReachableNames } from '../module-exports'

export interface JsxAdapterConfig {
  /** Use typed versions (typedInitialValue, etc.) for type-safe .tsx output */
  preserveTypes: boolean
}

export abstract class JsxAdapter extends BaseAdapter {
  protected componentName: string = ''

  /** Subclasses define whether to use typed values for type-safe output */
  protected abstract jsxConfig: JsxAdapterConfig

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
   * Generate SSR no-op initializers for signals, memos, constants, and functions.
   * Performs transitive dependency analysis to skip unreachable declarations.
   */
  protected generateSignalInitializers(ir: ComponentIR, jsxBody: string): string {
    const lines: string[] = []
    const { preserveTypes } = this.jsxConfig

    // Build primary reference text for reachability analysis:
    // jsxBody + signal initial values + memo computations (these are the "consumers")
    const primaryRefs = [jsxBody]
    for (const signal of ir.metadata.signals) {
      primaryRefs.push(signal.initialValue)
    }
    for (const memo of ir.metadata.memos) {
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
      // Create a getter that returns the initial value for SSR
      const rawInitialValue = preserveTypes
        ? (signal.typedInitialValue ?? signal.initialValue)
        : signal.initialValue
      const initialValue = rawInitialValue.trim().startsWith('{') ? `(${rawInitialValue})` : rawInitialValue

      // When preserveTypes and typedInitialValue is absent but signal.type has a meaningful
      // type from a generic parameter, add a type assertion to prevent TS inference issues
      const needsTypeAssertion = preserveTypes
        && !signal.typedInitialValue
        && signal.type.kind !== 'unknown'
        && signal.type.kind !== 'primitive'
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
      // Evaluate memo computation at SSR time
      const computation = preserveTypes
        ? (memo.typedComputation ?? memo.computation)
        : memo.computation
      lines.push(`  const ${memo.name} = ${computation}`)
    }

    // Include local constants — skip unreachable ones (only used in event handlers)
    for (const constant of ir.metadata.localConstants) {
      if (constant.isExported) continue
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

    // Include local functions — skip unreachable ones (only used in event handlers)
    for (const func of localFunctions) {
      if (!reachable.has(func.name)) continue
      const params = func.params.map(formatParamWithType).join(', ')
      const body = preserveTypes
        ? (func.typedBody ?? func.body)
        : func.body
      lines.push(`  function ${func.name}(${params}) ${body}`)
    }

    return lines.join('\n')
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
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(instanceIdExpr: string): string {
    return `bf-s={${instanceIdExpr}}`
  }

  renderSlotMarker(slotId: string): string {
    return `bf="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `bf-c="${condId}"`
  }
}
