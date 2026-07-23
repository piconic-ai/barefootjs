/**
 * BarefootJS Compiler - Error Definitions
 */

import path from 'node:path'
import type {
  CompilerError,
  ErrorSeverity,
  ErrorSuggestion,
  SourceLocation,
} from './types.ts'

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  // Directive errors (BF001-BF009)
  MISSING_USE_CLIENT: 'BF001',
  CLIENT_IMPORTING_SERVER: 'BF003',

  // Signal/Memo errors (BF011-BF019)
  SIGNAL_OUTSIDE_COMPONENT: 'BF011',

  // JSX errors (BF021-BF029)
  UNSUPPORTED_JSX_PATTERN: 'BF021',
  MISSING_KEY_IN_LIST: 'BF023',
  MISSING_KEY_IN_NESTED_LIST: 'BF024',
  UNSUPPORTED_DESTRUCTURE_REST: 'BF025',
  // A `.map()` list-render callback whose body is a statement block
  // (`(item) => { ... return <jsx> }`) instead of a single JSX expression.
  // The list-lowering pipeline only builds a per-item template from an
  // expression body (JSX literal, or a ternary / logical / component call
  // that resolves to JSX); a block body is not lowered and, before this
  // diagnostic, leaked the raw JSX return into the emitted client bundle —
  // an `Unexpected token '<'` SyntaxError at runtime that silently broke
  // hydration while the build still reported success. Mirrors BF045's
  // "use a single return statement" stance for local JSX functions.
  UNSUPPORTED_LIST_CALLBACK_BODY: 'BF026',

  // Component errors (BF043-BF049)
  PROPS_DESTRUCTURING: 'BF043',
  SIGNAL_GETTER_NOT_CALLED: 'BF044',
  JSX_IN_LOCAL_FUNCTION: 'BF045',
  COMPONENT_REQUIRED_PROP_MISSING: 'BF046',
  // A JSX-typed `const X = <jsx/>` declared inside an early-return
  // `if`-block is referenced inside a raw-captured callback body
  // (`ref={(el) => use(X)}`, `onClick={() => use(X)}`). The
  // multi-return pipeline has no way to keep the JSX live as a
  // runtime value here — substituting the JSX literal into the
  // emitted callback body would produce TS JSX inside a JS string
  // (invalid), and leaving the bare identifier produces a runtime
  // ReferenceError at hydrate. Fail loud with workaround pointers
  // (#1414 cell 5).
  JSX_BRANCH_LOCAL_IN_CALLBACK: 'BF047',

  // Import errors (BF050-BF059)
  SHARED_PROGRAM_REQUIRED: 'BF050',
  WRONG_PACKAGE_IMPORT: 'BF051',
  // A bare `<Async>` / `<Region>` tag was used without importing it from
  // `@barefootjs/client`. The built-ins are recognised import-scoped (#1915),
  // so an unimported tag with the built-in name is either a forgotten import
  // or an undeclared component — fail loud with the import to add.
  BUILTIN_REQUIRES_IMPORT: 'BF054',

  // Init statement errors (BF052)
  UNDECLARED_INIT_STATEMENT_REFERENCE: 'BF052',

  // Stripped-import diagnostics (BF053) — a relative import was removed
  // from a compiled client bundle (e.g. a sibling '.tsx' deferred to its
  // own client JS, an unresolved path, or a circular relative dep) but
  // the binding name still appears as a value reference in the bundle.
  // Silent strips here surface as runtime `ReferenceError`; making the
  // strip a build-time error closes the gap. See piconic-ai/barefootjs#1227.
  STRIPPED_CLIENT_IMPORT_REFERENCED: 'BF053',

  // Stage-violation errors (BF060-BF069) — cross-scope references the
  // staged-IR refactor (#1138) surfaces structurally rather than
  // hiding behind silent fallbacks. All three are hard errors: at
  // the offending template position the SSR HTML observably differs
  // from the intended output (missing attribute, permanently-empty
  // text, wrong conditional branch, or zero-item loop), and the
  // pipeline has no slot for hydrate to recover from. The diagnostic
  // is gated on `templateRiskyNames` in `compute-inlinability.ts` so
  // safe-fallback positions (component props, slotted JSX
  // expressions, `/* @client */` wrappers) don't trigger — those
  // shapes recover at hydrate without a visible artefact.
  STAGE_REACTIVE_IN_TEMPLATE: 'BF060',
  STAGE_INIT_LOCAL_IN_TEMPLATE: 'BF061',
  STAGE_AWAIT_IN_TEMPLATE: 'BF062',

  // Inline JSX-callback synthesis errors (BF080-BF089) — raised by the
  // preprocess-inline-jsx-callbacks pass (#1211) when an inline JSX-
  // returning arrow cannot be safely hoisted into a synthesized
  // module-scope component.
  INLINE_JSX_CALLBACK_CAPTURE: 'BF080',

  // Reactive factory errors (BF110-BF119)
  UNRECOGNIZED_REACTIVE_FACTORY: 'BF110',
  REACTIVE_FACTORY_RENAME_UNSUPPORTED: 'BF111',
  REACTIVE_FACTORY_MODULE_CAPTURE: 'BF112',
  REACTIVE_FACTORY_IMPORT_COLLISION: 'BF113',
  REACTIVE_FACTORY_PARAM_SHADOWED: 'BF114',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// =============================================================================
// Error Messages
// =============================================================================

const errorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.MISSING_USE_CLIENT]:
    "'use client' directive required for components with createSignal or event handlers",
  [ErrorCodes.CLIENT_IMPORTING_SERVER]:
    'Client component cannot import server component',

  [ErrorCodes.SIGNAL_OUTSIDE_COMPONENT]:
    'Module-level reactive declaration (createSignal / createMemo) is not allowed. ' +
    'The downstream codegen drops the declaration silently and every reference becomes a ReferenceError at SSR and at hydrate. ' +
    'Move the declaration inside a component function so each mount gets its own state.',

  [ErrorCodes.UNSUPPORTED_JSX_PATTERN]: 'Unsupported JSX pattern',
  [ErrorCodes.MISSING_KEY_IN_LIST]:
    'Missing key attribute in list rendering. Add a key prop for efficient updates',
  [ErrorCodes.MISSING_KEY_IN_NESTED_LIST]:
    'Nested .map() loop requires key attribute for event delegation. Add a key prop to elements in the inner loop',
  [ErrorCodes.UNSUPPORTED_LIST_CALLBACK_BODY]:
    'Unsupported .map() list-render callback. A block-body callback that returns JSX from multiple branches is lowered to a per-item conditional only when the body is a plain if / else-if / else (or switch) chain of direct `return <JSX/>` statements. ' +
    'This body mixes those branching returns with a local variable declaration or nested control flow, which cannot be lowered — leaving the raw JSX to leak into the client bundle and throw at runtime. ' +
    'Keep each branch a direct `return <JSX/>` and move any per-item computation into the array before mapping (or into the returned JSX expression); or collapse the branches into a single ternary.',

  [ErrorCodes.UNSUPPORTED_DESTRUCTURE_REST]:
    // Despite the legacy `UNSUPPORTED_DESTRUCTURE_REST` name, this code now
    // fires only for shapes that are valid TypeScript but unrepresentable in
    // IR — currently just non-literal computed property keys (`{ [KEY]: v }`).
    // Rest elements themselves were lowered in #1244 / #1309; the constant
    // keeps its name so external consumers' `e.code === 'BF025'` checks remain
    // stable.
    'Computed property key in .map() callback destructure is not supported. Rewrite the callback to destructure explicit bindings (e.g., `({ a, b }) => ...`) so the compiler can rewrite references to per-item signal accessors.',

  [ErrorCodes.PROPS_DESTRUCTURING]:
    'Props destructuring in function parameters breaks reactivity. Use props object directly.',
  [ErrorCodes.SIGNAL_GETTER_NOT_CALLED]:
    'Signal/memo getter passed without calling it. Use getter() to read the value.',
  [ErrorCodes.JSX_IN_LOCAL_FUNCTION]:
    'Local function returns JSX but cannot be inlined. Extract it as a top-level PascalCase component or use a single return statement.',

  [ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING]:
    'Built-in component is missing a required prop.',

  [ErrorCodes.JSX_BRANCH_LOCAL_IN_CALLBACK]:
    "JSX-typed local declared inside an `if`-block cannot be referenced from a callback body (ref / event handler). " +
    "Render it as a child instead: `<div ref={...}>{local}</div>`.",

  [ErrorCodes.SHARED_PROGRAM_REQUIRED]:
    'Shared ts.Program required for type-based reactivity classification. This source imports a Reactive<T>-branded library (e.g. @barefootjs/form) whose getters cannot be classified by regex alone. Pass `options.program` (built via `createProgramForCorpus`) so the analyzer can resolve the brand through the TypeChecker.',

  [ErrorCodes.WRONG_PACKAGE_IMPORT]:
    'Import from wrong package.',

  [ErrorCodes.BUILTIN_REQUIRES_IMPORT]:
    "Built-in <Async> / <Region> must be imported from '@barefootjs/client'. " +
    'The compiler recognises these tags by their import (not by tag name), ' +
    'so an unimported tag with this name is treated as an undeclared component.',

  [ErrorCodes.UNDECLARED_INIT_STATEMENT_REFERENCE]:
    'Init statement references an undeclared identifier. Declare it at module scope, inside the component, or import it — otherwise ESM strict mode throws ReferenceError at runtime.',

  [ErrorCodes.STRIPPED_CLIENT_IMPORT_REFERENCED]:
    "Import was stripped from the client bundle but its binding is still referenced. Client components ('use client' .tsx) are not callable as plain functions from imperative .ts modules — render them as JSX from a 'use client' parent instead. If the flagged name is a local shadow rather than the stripped import, please file an issue.",

  [ErrorCodes.STAGE_REACTIVE_IN_TEMPLATE]:
    'Reactive binding (signal getter or memo) referenced from template scope. The template lambda runs at module scope without the reactive context, so the value cannot be evaluated at SSR. Wrap the JSX expression in /* @client */ to defer it to hydrate, or restructure so the template uses a prop or static value.',

  [ErrorCodes.STAGE_INIT_LOCAL_IN_TEMPLATE]:
    'Init-scope local referenced from template scope. The template lambda runs at module scope (via render() / renderChild()) and cannot reach init-body locals. Wrap the JSX expression in /* @client */, or lift the value to a prop or module-scope const.',

  [ErrorCodes.STAGE_AWAIT_IN_TEMPLATE]:
    'AwaitExpression in template scope. The generated template and init functions are synchronous — a bare `await` produces a SyntaxError at parse time. Move the await into the component body (before the return) or into an onMount/effect callback, and pass the resolved value to JSX.',

  [ErrorCodes.INLINE_JSX_CALLBACK_CAPTURE]:
    "Inline JSX-returning arrow function captures a non-module identifier. Extract the callback into a top-level 'use client' component (e.g. `function MyNode(n) { return <div/> }` then `renderNode={MyNode}`) or pass captured values via component props.",

  [ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY]:
    'Tuple destructuring of a non-reactive factory call. The compiler only recognizes createSignal / createMemo calls and same-file helpers that wrap them with a single `return [a, b]` exit.',

  [ErrorCodes.REACTIVE_FACTORY_RENAME_UNSUPPORTED]:
    'Reactive factory object return/destructure must use shorthand properties only. ' +
    'Property renames (`{ lists: myLists }`), defaults, and rest elements are not ' +
    'supported — destructure with the factory\'s own property names.',

  [ErrorCodes.REACTIVE_FACTORY_MODULE_CAPTURE]:
    'Imported reactive factory references bindings from its own module scope, so its ' +
    'body cannot be inlined into the component file. Move those helpers into the ' +
    'component file, pass them to the factory as parameters, or define the factory ' +
    'in the component file.',

  [ErrorCodes.REACTIVE_FACTORY_IMPORT_COLLISION]:
    'Inlining an imported reactive factory requires re-importing one of its helper ' +
    'imports into this file, but that name is already bound here to something else. ' +
    "Rename the conflicting binding in this file, or alias the import in the factory's own file.",

  [ErrorCodes.REACTIVE_FACTORY_PARAM_SHADOWED]:
    'Reactive factory parameter is shadowed by a nested declaration inside the factory body, so argument substitution at the inline site would be ambiguous. Rename the inner binding so it does not collide with the parameter.',
}

// =============================================================================
// Error Factory
// =============================================================================

export function createError(
  code: ErrorCode,
  loc: SourceLocation,
  options?: {
    severity?: ErrorSeverity
    message?: string
    suggestion?: ErrorSuggestion
  }
): CompilerError {
  // Guard against silent failure when a stale build of this package is
  // loaded by a consumer: if `code` is `undefined` (typically because a
  // newer source-level ErrorCodes entry isn't present in the compiled
  // artifact), every error this consumer creates would otherwise carry
  // `code: undefined` and pass through downstream `errors[i].code ===
  // 'BFxxx'` checks as `undefined` — a runtime ReferenceError waiting to
  // happen. Fail loud at the construction site instead.
  if (code === undefined || !(code in errorMessages)) {
    throw new Error(
      `createError: unknown error code ${JSON.stringify(code)}. ` +
        `This usually means a consumer is loading a stale build of @barefootjs/jsx ` +
        `that predates the ErrorCodes entry, or the code was renamed without ` +
        `updating callers.`,
    )
  }
  return {
    code,
    severity: options?.severity ?? 'error',
    message: options?.message ?? errorMessages[code],
    loc,
    suggestion: options?.suggestion,
  }
}

export function createWarning(
  code: ErrorCode,
  loc: SourceLocation,
  options?: {
    message?: string
    suggestion?: ErrorSuggestion
  }
): CompilerError {
  return createError(code, loc, { ...options, severity: 'warning' })
}

export function createInfo(
  code: ErrorCode,
  loc: SourceLocation,
  options?: {
    message?: string
    suggestion?: ErrorSuggestion
  }
): CompilerError {
  return createError(code, loc, { ...options, severity: 'info' })
}

// =============================================================================
// Code Frame Generator
// =============================================================================

export function generateCodeFrame(
  source: string,
  loc: SourceLocation,
  contextLines = 2
): string {
  const lines = source.split('\n')
  const startLine = Math.max(0, loc.start.line - 1 - contextLines)
  const endLine = Math.min(lines.length, loc.end.line + contextLines)

  const frameLines: string[] = []
  const lineNumWidth = String(endLine).length

  for (let i = startLine; i < endLine; i++) {
    const lineNum = i + 1
    const isErrorLine = lineNum >= loc.start.line && lineNum <= loc.end.line
    const prefix = isErrorLine ? '>' : ' '
    const paddedLineNum = String(lineNum).padStart(lineNumWidth)

    frameLines.push(`${prefix} ${paddedLineNum} | ${lines[i]}`)

    // Add underline for error lines
    if (isErrorLine) {
      const startCol = lineNum === loc.start.line ? loc.start.column : 0
      const endCol =
        lineNum === loc.end.line ? loc.end.column : lines[i].length

      const padding = ' '.repeat(lineNumWidth + 4 + startCol)
      const underline = '^'.repeat(Math.max(1, endCol - startCol))
      frameLines.push(`${padding}${underline}`)
    }
  }

  return frameLines.join('\n')
}

// =============================================================================
// Error Formatter
// =============================================================================

// path.relative produces `..`-prefixed results when `from` is outside
// `projectDir`. For dependency files surfaced through the analyzer
// (node_modules, sibling workspaces) that's noisier than the absolute
// path the developer can copy into their editor, so we fall back to
// the raw path in that case.
function relativizePath(filePath: string, projectDir: string): string {
  if (!path.isAbsolute(filePath)) return filePath
  const rel = path.relative(projectDir, filePath)
  if (!rel || rel.startsWith('..')) return filePath
  return rel
}


export function formatError(
  error: CompilerError,
  source?: string,
  options?: { projectDir?: string },
): string {
  // Lowercase severity matches the prose convention in
  // `docs/core/advanced/error-codes.md` (`error[BF001]:`,
  // `warning[BF043]:`) — that doc IS the rendering contract referenced
  // by `bf guide advanced/error-codes`, so keep the wire format aligned
  // with the reference rather than the function's old uppercase shape.
  const severityLabel = error.severity
  const lines: string[] = []

  // Strip the project root so the `--> file:line:col` row stays terse
  // in CLI output — absolute paths blow past 80 columns on most
  // checkouts and obscure the line/column at the tail. The compiler
  // itself can't know the project root (it sees one file at a time),
  // so the CLI/preview passes it in here.
  const displayFile = options?.projectDir
    ? relativizePath(error.loc.file, options.projectDir)
    : error.loc.file

  lines.push(`${severityLabel}[${error.code}]: ${error.message}`)
  lines.push('')
  lines.push(
    `  --> ${displayFile}:${error.loc.start.line}:${error.loc.start.column}`
  )

  if (source) {
    lines.push('   |')
    const frame = generateCodeFrame(source, error.loc)
    lines.push(
      frame
        .split('\n')
        .map((l) => `   ${l}`)
        .join('\n')
    )
    lines.push('   |')
  }

  if (error.suggestion) {
    lines.push(`   = help: ${error.suggestion.message}`)
    if (error.suggestion.replacement) {
      lines.push('')
      lines.push(`   ${error.suggestion.replacement}`)
    }
  }

  return lines.join('\n')
}

// =============================================================================
// Internal Invariants
// =============================================================================

/**
 * Throws when an internal compiler contract is violated. Use for AST shapes
 * the TypeScript parser already rules out — if the branch fires, an upstream
 * producer (codemod, AST transformer, malformed-source path) handed us a node
 * that should not exist. Distinct from user-facing diagnostics (BF0xx) so a
 * thrown stack points at the broken caller instead of being swallowed into a
 * misleading per-source error message.
 */
export class InternalInvariantError extends Error {
  constructor(message: string) {
    super(`barefoot internal invariant: ${message}`)
    this.name = 'InternalInvariantError'
  }
}

export function internalInvariant(
  cond: unknown,
  message: string,
): asserts cond {
  if (!cond) {
    throw new InternalInvariantError(message)
  }
}

// =============================================================================
// Source Location Helpers
// =============================================================================

export function createLocation(
  file: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): SourceLocation {
  return {
    file,
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  }
}

export function mergeLocations(
  start: SourceLocation,
  end: SourceLocation
): SourceLocation {
  return {
    file: start.file,
    start: start.start,
    end: end.end,
  }
}
