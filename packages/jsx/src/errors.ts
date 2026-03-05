/**
 * BarefootJS Compiler - Error Definitions
 */

import type {
  CompilerError,
  ErrorSeverity,
  ErrorSuggestion,
  SourceLocation,
} from './types'

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  // Directive errors (BF001-BF009)
  MISSING_USE_CLIENT: 'BF001',
  INVALID_DIRECTIVE_POSITION: 'BF002',
  CLIENT_IMPORTING_SERVER: 'BF003',

  // Signal/Memo errors (BF010-BF019)
  UNKNOWN_SIGNAL: 'BF010',
  SIGNAL_OUTSIDE_COMPONENT: 'BF011',
  INVALID_SIGNAL_USAGE: 'BF012',

  // JSX errors (BF020-BF029)
  INVALID_JSX_EXPRESSION: 'BF020',
  UNSUPPORTED_JSX_PATTERN: 'BF021',
  INVALID_JSX_ATTRIBUTE: 'BF022',
  MISSING_KEY_IN_LIST: 'BF023',

  // Type errors (BF030-BF039)
  TYPE_INFERENCE_FAILED: 'BF030',
  PROPS_TYPE_MISMATCH: 'BF031',

  // Component errors (BF040-BF049)
  COMPONENT_NOT_FOUND: 'BF040',
  CIRCULAR_DEPENDENCY: 'BF041',
  INVALID_COMPONENT_NAME: 'BF042',
  PROPS_DESTRUCTURING: 'BF043',
  SIGNAL_GETTER_NOT_CALLED: 'BF044',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// =============================================================================
// Error Messages
// =============================================================================

const errorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.MISSING_USE_CLIENT]:
    "'use client' directive required for components with createSignal or event handlers",
  [ErrorCodes.INVALID_DIRECTIVE_POSITION]:
    "'use client' directive must be at the top of the file",
  [ErrorCodes.CLIENT_IMPORTING_SERVER]:
    'Client component cannot import server component',

  [ErrorCodes.UNKNOWN_SIGNAL]: 'Unknown signal reference',
  [ErrorCodes.SIGNAL_OUTSIDE_COMPONENT]:
    'Signal must be used inside a component function',
  [ErrorCodes.INVALID_SIGNAL_USAGE]: 'Invalid signal usage',

  [ErrorCodes.INVALID_JSX_EXPRESSION]: 'Invalid JSX expression',
  [ErrorCodes.UNSUPPORTED_JSX_PATTERN]: 'Unsupported JSX pattern',
  [ErrorCodes.INVALID_JSX_ATTRIBUTE]: 'Invalid JSX attribute',
  [ErrorCodes.MISSING_KEY_IN_LIST]:
    'Missing key attribute in list rendering. Add a key prop for efficient updates',

  [ErrorCodes.TYPE_INFERENCE_FAILED]: 'Failed to infer type',
  [ErrorCodes.PROPS_TYPE_MISMATCH]: 'Props type mismatch',

  [ErrorCodes.COMPONENT_NOT_FOUND]: 'Component not found',
  [ErrorCodes.CIRCULAR_DEPENDENCY]: 'Circular dependency detected',
  [ErrorCodes.INVALID_COMPONENT_NAME]:
    'Component name must start with uppercase letter',
  [ErrorCodes.PROPS_DESTRUCTURING]:
    'Props destructuring in function parameters breaks reactivity. Use props object directly.',
  [ErrorCodes.SIGNAL_GETTER_NOT_CALLED]:
    'Signal/memo getter passed without calling it. Use getter() to read the value.',
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

export function formatError(error: CompilerError, source?: string): string {
  const severityLabel = error.severity.toUpperCase()
  const lines: string[] = []

  lines.push(`${severityLabel}[${error.code}]: ${error.message}`)
  lines.push('')
  lines.push(
    `  --> ${error.loc.file}:${error.loc.start.line}:${error.loc.start.column}`
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
