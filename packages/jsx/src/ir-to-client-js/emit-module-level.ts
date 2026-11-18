/**
 * Module-level emission + final import resolution.
 *
 * Two concerns that run AFTER the init body has been emitted into the
 * `lines` array and joined into a string:
 *
 *   1. `emitModuleLevelDeclarations` produces the code block that
 *      replaces `MODULE_CONSTANTS_PLACEHOLDER`. Each module-level
 *      constant / function is emitted as `var X = X ?? <value>` so
 *      multiple components in the same bundle can share the same
 *      helper safely (re-declaration is a no-op).
 *
 *   2. `resolveFinalImports` scans the joined code for DOM helper
 *      calls the emitters made (`$`, `$t`, `$c`, `createEffect`,
 *      `hydrate`, …) and builds the final `import { … } from
 *      '@barefootjs/client'` line, plus any external/user imports.
 *
 * Both are pure functions of their inputs. `generate-init.ts` glues
 * them onto the placeholder replacements at the end of emission.
 */

import type { ComponentIR, ConstantInfo, FunctionInfo, SignalInfo, MemoInfo } from '../types.ts'
import {
  RUNTIME_MODULE,
  collectExternalImports,
  collectUserDomImports,
  detectUsedImports,
} from './imports.ts'
import { signalFactoryInitializer, signalSecondBinding } from '../signal-initializer.ts'
import { usedReplicaDeclarations, type ModuleScopeReplica } from '../module-scope.ts'

/**
 * Build the module-level code block that replaces `MODULE_CONSTANTS_PLACEHOLDER`.
 *
 * Module-level constants use `var` with nullish coalescing for safe
 * re-declaration when multiple components in the same file share
 * context. Module-level functions get the same treatment so components
 * that import the same helper do not double-declare.
 *
 * Returns the empty string when there is nothing to emit (preserves
 * the legacy behaviour of replacing the placeholder with `""`).
 */
export function emitModuleLevelDeclarations(
  moduleLevelConstants: readonly ConstantInfo[],
  moduleLevelFunctions: readonly FunctionInfo[],
  moduleLevelSignals: readonly SignalInfo[] = [],
  moduleLevelMemos: readonly MemoInfo[] = [],
): string {
  const lines: string[] = []
  for (const constant of moduleLevelConstants) {
    if (!constant.value) continue
    // An arrow-valued initializer needs parenthesising on the right of
    // `??` — `x ?? (s) => …` is a SyntaxError because `??`'s operand
    // grammar (BitwiseORExpression) is higher-precedence than an arrow
    // function (AssignmentExpression); only an already-parenthesised
    // value (an object literal, `(a, b) => …`) survives unwrapped, and
    // wrapping those again is a harmless no-op (#2988). Gated on
    // `containsArrow` specifically so existing fixtures with
    // parenthesised object-literal module consts don't churn.
    const value = constant.containsArrow ? `(${constant.value})` : constant.value
    lines.push(`var ${constant.name} = ${constant.name} ?? ${value}`)
  }
  for (const fn of moduleLevelFunctions) {
    lines.push(`var ${fn.name} = ${fn.name} ?? ${functionExpressionText(fn)}`)
  }
  for (const signal of moduleLevelSignals) {
    const tupleVar = `__bf_m_${signal.getter}_tuple`
    const initializer = signalFactoryInitializer(signal) ?? `createSignal(${signal.initialValue})`
    const second = signalSecondBinding(signal)
    if (signal.isExported) {
      lines.push(`export const [${signal.getter}${second ? `, ${second}` : ''}] = ${initializer}`)
    } else {
      lines.push(`var ${tupleVar} = ${tupleVar} ?? ${initializer}`)
      lines.push(`var ${signal.getter} = ${tupleVar}[0]`)
      if (second) {
        lines.push(`var ${second} = ${tupleVar}[1]`)
      }
    }
  }
  for (const memo of moduleLevelMemos) {
    if (memo.isExported) {
      lines.push(`export const ${memo.name} = createMemo(${memo.computation})`)
    } else {
      lines.push(`var ${memo.name} = ${memo.name} ?? createMemo(${memo.computation})`)
    }
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/** `fn` as an anonymous function expression: `async function*(a, ...b) { … }`. */
function functionExpressionText(fn: FunctionInfo): string {
  const paramStr = fn.params.map(p => {
    const rest = p.isRest ? '...' : ''
    return p.defaultValue !== undefined ? `${rest}${p.name} = ${p.defaultValue}` : `${rest}${p.name}`
  }).join(', ')
  const asyncKw = fn.isAsync ? 'async ' : ''
  // Generator functions (`function*`) can't be arrows — preserve `*`.
  const genStar = fn.isGenerator ? '*' : ''
  return `${asyncKw}function${genStar}(${paramStr}) ${fn.body}`
}

/**
 * The module-scope replica of a component (`moduleScopeView`, #3739): the
 * module consts whose value depends on a name the component binds, evaluated
 * once at module level, where those names are the module's own. Declares
 * only what the members named in `usedNames` need, and returns `''` when the
 * component reads none of them.
 *
 * The replica is a function scope, so its declarations keep their source
 * names without meeting the module-level names of another file inlined into
 * the same bundle. `var X = X ?? …` makes a second copy of the same
 * component's script a no-op, as it does for the declarations above.
 */
export function emitModuleScopeReplica(
  replica: ModuleScopeReplica | null,
  usedNames: ReadonlySet<string>,
): string {
  if (!replica) return ''
  const used = usedReplicaDeclarations(replica, usedNames)
  if (!used) return ''
  const lines: string[] = [`var ${replica.name} = ${replica.name} ?? (() => {`]
  for (const fn of used.functions) lines.push(`  const ${fn.name} = ${functionExpressionText(fn)}`)
  for (const c of used.constants) lines.push(`  ${c.declarationKind} ${c.name} = ${c.value}`)
  lines.push(`  return { ${used.exported.join(', ')} }`)
  lines.push('})()')
  return lines.join('\n') + '\n'
}

/**
 * Build the final import line(s) for the emitted client JS.
 *
 * - Runtime DOM helpers detected via `detectUsedImports` are merged
 *   with user-side DOM imports (`useContext` et al) and emitted as a
 *   single `import { … } from '@barefootjs/client'` line.
 * - External (non-runtime) imports from the user file are appended on
 *   following lines.
 */
export function resolveFinalImports(
  generatedCode: string,
  ir: ComponentIR,
  localImportPrefixes: string[] | undefined,
): string {
  const usedImports = detectUsedImports(generatedCode)
  for (const userImport of collectUserDomImports(ir)) {
    usedImports.add(userImport)
  }
  const sortedImports = [...usedImports].sort()
  const importLine = `import { ${sortedImports.join(', ')} } from '${RUNTIME_MODULE}'`

  const externalImportLines = collectExternalImports(ir, generatedCode, localImportPrefixes)
  return [importLine, ...externalImportLines].join('\n')
}
