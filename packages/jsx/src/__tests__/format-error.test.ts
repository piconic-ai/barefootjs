/**
 * Tests for `formatError` — the BF-diagnostic renderer the CLI / preview
 * compile loop pipes every per-file error and warning through.
 *
 * Locks the rendering contract that `docs/core/advanced/error-codes.md`
 * (linked by `bf guide advanced/error-codes`) shows users they'll see:
 *
 *   - lowercase `error[BFxxx]:` / `warning[BFxxx]:` header,
 *   - `--> file:line:col` row with project-relative path when projectDir given,
 *   - optional code frame when source is passed,
 *   - optional `= help:` row when the diagnostic carries a suggestion.
 */

import { describe, test, expect } from 'bun:test'
import { createError, formatError, ErrorCodes } from '../errors'

describe('formatError — diagnostic rendering contract', () => {
  test('lowercase severity in header matches docs/core/advanced/error-codes.md', () => {
    const err = createError(ErrorCodes.MISSING_KEY_IN_LIST, {
      file: 'components/TodoList.tsx',
      start: { line: 4, column: 8 },
      end: { line: 4, column: 12 },
    })

    const out = formatError(err)
    expect(out).toContain('error[BF023]:')
    expect(out).not.toContain('ERROR[BF023]:')
  })

  test('warning severity also lowercases', () => {
    const err = createError(
      ErrorCodes.PROPS_DESTRUCTURING,
      {
        file: 'components/Display.tsx',
        start: { line: 1, column: 17 },
        end: { line: 1, column: 26 },
      },
      { severity: 'warning' },
    )

    const out = formatError(err)
    expect(out).toContain('warning[BF043]:')
  })

  test('--> row carries the documented file:line:col location', () => {
    const err = createError(ErrorCodes.MISSING_KEY_IN_LIST, {
      file: 'components/TodoList.tsx',
      start: { line: 45, column: 10 },
      end: { line: 45, column: 14 },
    })

    expect(formatError(err)).toContain('--> components/TodoList.tsx:45:10')
  })

  test('projectDir relativizes an absolute file path for CLI display', () => {
    const err = createError(ErrorCodes.MISSING_KEY_IN_LIST, {
      file: '/home/user/my-app/components/TodoList.tsx',
      start: { line: 45, column: 10 },
      end: { line: 45, column: 14 },
    })

    const out = formatError(err, undefined, { projectDir: '/home/user/my-app' })
    expect(out).toContain('--> components/TodoList.tsx:45:10')
    expect(out).not.toContain('/home/user/my-app/components')
  })

  test('projectDir falls back to the absolute path when the file is outside the project', () => {
    const err = createError(ErrorCodes.MISSING_KEY_IN_LIST, {
      file: '/elsewhere/dep/foo.tsx',
      start: { line: 1, column: 0 },
      end: { line: 1, column: 1 },
    })

    const out = formatError(err, undefined, { projectDir: '/home/user/my-app' })
    expect(out).toContain('--> /elsewhere/dep/foo.tsx:1:0')
  })

  test('source argument adds a code frame between `   |` fences', () => {
    const source = "function X() {\n  return (\n    <ul>\n      {items.map(i => <li>{i}</li>)}\n    </ul>\n  )\n}"
    const err = createError(ErrorCodes.MISSING_KEY_IN_LIST, {
      file: 'X.tsx',
      start: { line: 4, column: 22 },
      end: { line: 4, column: 26 },
    })

    const out = formatError(err, source)
    expect(out).toContain('   |')
    expect(out).toContain('<li>{i}</li>')
  })

  test('suggestion renders as a `= help:` row at the tail', () => {
    const err = createError(
      ErrorCodes.PROPS_DESTRUCTURING,
      {
        file: 'Display.tsx',
        start: { line: 1, column: 17 },
        end: { line: 1, column: 26 },
      },
      {
        severity: 'warning',
        suggestion: { message: 'Access props via `props.value` to maintain reactivity' },
      },
    )

    const out = formatError(err)
    expect(out).toContain('= help: Access props via `props.value`')
  })
})
