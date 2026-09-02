// @barefootjs/compat — pure compile+reduce logic. No console output here;
// the command layer (src/cli.ts) owns all user-facing text.

import type { ComponentIR, CompilerError, ConformancePins, EscapeKind, TemplateAdapter } from '@barefootjs/jsx'
import { compileJSX } from '@barefootjs/jsx'

export type CompatMode = 'build' | 'conformance'

/**
 * Register a child/sibling component's cross-component shape on the adapter
 * when it supports the optional `registerChildComponentShape` hook (Go
 * template — #checkbox). A no-op on adapters without it. Mirrors
 * `packages/adapter-tests/src/jsx-runner.ts`'s identically-named helper and
 * `test-render.ts`'s original: `compileJSX` alone never calls this hook, so
 * a diagnostic that depends on it (a prop routed into a child's rest bag
 * rather than a declared field, #2805) would silently never fire under
 * `compileForCompat`'s conformance-mode compile-only path without this.
 */
function registerChildShape(adapter: TemplateAdapter, ir: ComponentIR): void {
  const hook = (adapter as { registerChildComponentShape?: (ir: ComponentIR) => void }).registerChildComponentShape
  if (typeof hook === 'function') hook.call(adapter, ir)
}

export interface CompatDiagnostic {
  code: string
  severity: 'error' | 'warning'
  /** Known-limitation issue URLs pulled from the adapter's `conformancePins`, sorted + deduped. */
  issues: string[]
  /**
   * Escape kinds the diagnostics behind this cell CLAIM, deduped and
   * sorted (#2614). Sourced from `ErrorSuggestion.escape` — the structured
   * half of the suggestion, never its prose: a cell aggregates adapters
   * whose wording for the same code differs, so carrying per-adapter text
   * into the lock would export an internal inconsistency to users and
   * churn the committed lock on every wording edit. The enum survives both
   * problems, and renderers turn it back into one canonical wording.
   *
   * Absent when no contributing diagnostic declared one — which means "not
   * declared", not "no escape exists", since population is opportunistic.
   */
  escapes?: EscapeKind[]
}

export interface CompatCell {
  /** No error-severity diagnostic present. Warning-only cells are still `ok`. */
  ok: boolean
  diagnostics: CompatDiagnostic[]
}

/** Synthetic code substituted when `compileJSX` itself throws, so a compat run always yields a cell. */
export const COMPILE_THREW_CODE = 'COMPILE_THREW'

/**
 * Compile `source` against `adapter` and return every `CompilerError`
 * produced, in one of two modes:
 *
 * - `'build'` — the shape `bf build` compiles with (see
 *   packages/cli/src/lib/build.ts): `{ adapter, siblingTemplatesRegistered: true }`.
 *   Used by the `bun run compat` CLI against real ui/ components.
 * - `'conformance'` — mirrors `collectFixtureDiagnostics`
 *   (packages/adapter-tests/src/jsx-runner.ts) exactly: any `components`
 *   children are compiled first (each with `{ adapter, outputIR: true,
 *   siblingTemplatesRegistered }`), then the entry with the same options,
 *   concatenating every error. `siblingTemplatesRegistered` is true iff
 *   `components` is present, matching `bf build`'s real semantics (#2205).
 *   Used by the pin-consistency test to replay the adapter conformance
 *   suite's own compile shape.
 *
 * A thrown exception from `compileJSX` is swallowed and reported as a
 * single synthetic `{ code: 'COMPILE_THREW', severity: 'error' }`
 * diagnostic (deterministic, carries no message) rather than propagating
 * — a compat matrix must always produce a cell for every
 * component/adapter pair, never abort the whole run.
 */
export function compileForCompat(
  source: string,
  filePath: string,
  adapter: TemplateAdapter,
  mode: CompatMode,
  components?: Record<string, string>,
): CompilerError[] {
  try {
    if (mode === 'conformance') {
      const all: CompilerError[] = []
      const siblingTemplatesRegistered = Boolean(components)
      if (components) {
        for (const [filename, childSource] of Object.entries(components)) {
          const childResult = compileJSX(childSource.trimStart(), filename, {
            adapter,
            outputIR: true,
            siblingTemplatesRegistered,
          })
          all.push(...childResult.errors)
          for (const irFile of childResult.files.filter(f => f.type === 'ir')) {
            registerChildShape(adapter, JSON.parse(irFile.content) as ComponentIR)
          }
        }
      }
      const result = compileJSX(source.trimStart(), filePath, {
        adapter,
        outputIR: true,
        siblingTemplatesRegistered,
      })
      all.push(...result.errors)
      return all
    }

    const result = compileJSX(source, filePath, { adapter, siblingTemplatesRegistered: true })
    return result.errors
  } catch {
    return [
      {
        code: COMPILE_THREW_CODE,
        severity: 'error',
        message: '',
        loc: { file: filePath, start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      },
    ]
  }
}

/**
 * Reduce a raw `CompilerError[]` into a matrix cell: unique `(code,
 * severity)` pairs sorted by code then severity, `info` severity dropped
 * entirely, and each surviving diagnostic annotated with the known-
 * limitation issue URLs its code carries in `pins` — the pins ARE the
 * source of truth for that provenance, regardless of which fixture
 * originally declared them.
 */
export function buildCompatCell(errors: CompilerError[], pins: ConformancePins): CompatCell {
  const uniqueKeys = new Map<string, { code: string; severity: 'error' | 'warning' }>()
  for (const e of errors) {
    if (e.severity === 'info') continue
    uniqueKeys.set(`${e.code} ${e.severity}`, { code: e.code, severity: e.severity })
  }

  const sorted = [...uniqueKeys.values()].sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    return a.severity < b.severity ? -1 : a.severity > b.severity ? 1 : 0
  })

  const issuesByCode = new Map<string, Set<string>>()
  for (const entries of Object.values(pins)) {
    for (const pin of entries) {
      if (!pin.issue) continue
      let set = issuesByCode.get(pin.code)
      if (!set) {
        set = new Set()
        issuesByCode.set(pin.code, set)
      }
      set.add(pin.issue)
    }
  }

  // Union the structured escape claims per (code, severity), so a cell that
  // aggregates several refusals reports every way out any of them offers.
  // Sorted for a deterministic lock: the committed `compat.lock.json` is
  // drift-checked, so unordered set iteration would churn it spuriously.
  const escapesByKey = new Map<string, Set<EscapeKind>>()
  for (const e of errors) {
    if (e.severity === 'info') continue
    const claimed = e.suggestion?.escape
    if (!claimed?.length) continue
    const key = `${e.code} ${e.severity}`
    let set = escapesByKey.get(key)
    if (!set) {
      set = new Set<EscapeKind>()
      escapesByKey.set(key, set)
    }
    for (const { kind } of claimed) set.add(kind)
  }

  const diagnostics: CompatDiagnostic[] = sorted.map(({ code, severity }) => {
    const escapes = escapesByKey.get(`${code} ${severity}`)
    return {
      code,
      severity,
      issues: [...(issuesByCode.get(code) ?? [])].sort(),
      ...(escapes?.size ? { escapes: [...escapes].sort() } : {}),
    }
  })

  return {
    ok: !diagnostics.some(d => d.severity === 'error'),
    diagnostics,
  }
}
