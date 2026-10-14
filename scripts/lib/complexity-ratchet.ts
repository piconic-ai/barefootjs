/**
 * The cognitive-complexity ratchet (#3427).
 *
 * `cccc` (https://github.com/moznion/cccc) measures every function's
 * cognitive complexity in about a second. A plain `--max-cognitive` gate
 * would fail at once: hundreds of functions already exceed any reasonable
 * limit. So instead of a limit, `cccc-baseline.json` records the current
 * value of every function ABOVE the threshold, and the check fails only
 * when a function above the threshold got more complex than its recorded
 * value, when a new function entered above the threshold, or when the
 * baseline no longer matches the tree (a refactoring lowered a function
 * and the baseline must be regenerated, so it only ever moves down).
 *
 * Functions are identified by file path and qualified name (`outer/inner`
 * for a nested function). Two functions with the same qualified name in one
 * file — the repo's many `visit` closures, arrows reported as
 * `<anonymous>` — are compared as a multiset: their values above the
 * threshold are sorted descending and paired, so reordering or renaming the
 * ones below the threshold never trips the check. A name can only be
 * matched to a name, so renaming a hotspot reads as "entered" + "stale";
 * the fix in every such case is the same regenerate command.
 *
 * Entry point: `scripts/ci/complexity-ratchet.ts`; config: `cccc.toml`.
 */

/** The threshold a regenerated baseline records; the check reads the baseline's. */
export const DEFAULT_THRESHOLD = 25

export const BASELINE_FILE = 'cccc-baseline.json'
export const REGENERATE_COMMAND = 'bun run complexity:baseline'

/** One function in cccc's JSON output (nested functions under `children`). */
export interface CcccFunction {
  name: string
  kind: string
  line: number
  cognitive: number
  cyclomatic: number
  children?: CcccFunction[]
}

export interface CcccFile {
  path: string
  cognitive: number
  cyclomatic: number
  functions: CcccFunction[]
  parse_errors?: string[]
}

/** The top-level shape of `cccc <paths>` (JSON, not `--top-*` mode). */
export interface CcccReport {
  files: CcccFile[]
  summary: {
    file_count: number
    function_count: number
    parse_error_count: number
    parse_error_file_count: number
    parse_error_files?: string[]
  }
}

/**
 * `cccc-baseline.json`. `files` maps a path to its above-threshold
 * functions, each qualified name to its cognitive values sorted descending
 * (one entry per function carrying that name). Keys are sorted so a
 * regenerated file diffs minimally.
 */
export interface ComplexityBaseline {
  $comment: string
  /** `cccc --version`, so a scorer change is a deliberate regeneration. */
  cccc: string
  threshold: number
  files: Record<string, Record<string, number[]>>
}

export type Violation =
  | { kind: 'grew'; path: string; name: string; from: number; to: number }
  | { kind: 'entered'; path: string; name: string; cognitive: number }
  | { kind: 'stale'; path: string; name: string; baseline: number; current: number | null }

export interface RatchetVerdict {
  ok: boolean
  violations: Violation[]
  /** Functions above the threshold in the current tree, for the summary line. */
  aboveThreshold: number
}

const BASELINE_COMMENT =
  'Cognitive complexity of every function above the threshold, as measured by cccc ' +
  '(cccc.toml). Checked by `bun run complexity:check`; regenerate with ' +
  '`bun run complexity:baseline` after a refactoring lowers a function. Never edit by hand.'

/** Flatten a file's function tree into `[qualifiedName, cognitive]` pairs. */
export function flattenFunctions(functions: readonly CcccFunction[]): Array<[string, number]> {
  const out: Array<[string, number]> = []
  const visit = (fn: CcccFunction, prefix: string): void => {
    const name = prefix ? `${prefix}/${fn.name}` : fn.name
    out.push([name, fn.cognitive])
    for (const child of fn.children ?? []) visit(child, name)
  }
  for (const fn of functions) visit(fn, '')
  return out
}

/**
 * Every function above `threshold`, grouped by path then qualified name,
 * values sorted descending. The same shape the baseline stores.
 */
export function collectAboveThreshold(
  report: CcccReport,
  threshold: number,
): Record<string, Record<string, number[]>> {
  const files: Record<string, Record<string, number[]>> = {}
  for (const file of [...report.files].sort((a, b) => a.path.localeCompare(b.path))) {
    const byName = new Map<string, number[]>()
    for (const [name, cognitive] of flattenFunctions(file.functions)) {
      if (cognitive <= threshold) continue
      const values = byName.get(name) ?? []
      values.push(cognitive)
      byName.set(name, values)
    }
    if (byName.size === 0) continue
    const entry: Record<string, number[]> = {}
    for (const name of [...byName.keys()].sort()) {
      entry[name] = [...(byName.get(name) ?? [])].sort((a, b) => b - a)
    }
    files[file.path] = entry
  }
  return files
}

export function buildBaseline(report: CcccReport, threshold: number, ccccVersion: string): ComplexityBaseline {
  return {
    $comment: BASELINE_COMMENT,
    cccc: ccccVersion,
    threshold,
    files: collectAboveThreshold(report, threshold),
  }
}

export function serializeBaseline(baseline: ComplexityBaseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`
}

/**
 * Compare the tree against the baseline. Same-named functions in one file
 * are paired by descending value: the i-th largest current value must not
 * exceed the i-th largest recorded one, an extra current value is a new
 * entry above the threshold, and a missing or lower one is a stale
 * baseline entry.
 */
export function compareToBaseline(report: CcccReport, baseline: ComplexityBaseline): RatchetVerdict {
  const current = collectAboveThreshold(report, baseline.threshold)
  const violations: Violation[] = []
  let aboveThreshold = 0

  const paths = new Set([...Object.keys(current), ...Object.keys(baseline.files)])
  for (const path of [...paths].sort()) {
    const cur = current[path] ?? {}
    const base = baseline.files[path] ?? {}
    const names = new Set([...Object.keys(cur), ...Object.keys(base)])
    for (const name of [...names].sort()) {
      const curValues = cur[name] ?? []
      const baseValues = base[name] ?? []
      aboveThreshold += curValues.length
      const pairs = Math.max(curValues.length, baseValues.length)
      for (let i = 0; i < pairs; i++) {
        const to = curValues[i]
        const from = baseValues[i]
        if (to === undefined) {
          violations.push({ kind: 'stale', path, name, baseline: from, current: null })
        } else if (from === undefined) {
          violations.push({ kind: 'entered', path, name, cognitive: to })
        } else if (to > from) {
          violations.push({ kind: 'grew', path, name, from, to })
        } else if (to < from) {
          violations.push({ kind: 'stale', path, name, baseline: from, current: to })
        }
      }
    }
  }
  return { ok: violations.length === 0, violations, aboveThreshold }
}

/** Human-readable report of a failing verdict, one line per violation. */
export function formatVerdict(verdict: RatchetVerdict, threshold: number): string {
  const lines: string[] = []
  const grew = verdict.violations.filter((v) => v.kind === 'grew')
  const entered = verdict.violations.filter((v) => v.kind === 'entered')
  const stale = verdict.violations.filter((v) => v.kind === 'stale')
  if (grew.length > 0) {
    lines.push(`Functions above cognitive ${threshold} that got more complex (split them, or move the new logic out):`)
    for (const v of grew) {
      if (v.kind === 'grew') lines.push(`  ${v.path} ${v.name}: ${v.from} -> ${v.to}`)
    }
  }
  if (entered.length > 0) {
    lines.push(`New functions above cognitive ${threshold} (keep new functions under the threshold):`)
    for (const v of entered) {
      if (v.kind === 'entered') lines.push(`  ${v.path} ${v.name}: ${v.cognitive}`)
    }
  }
  if (stale.length > 0) {
    lines.push(
      `${BASELINE_FILE} is above the tree (a function was lowered, removed or renamed) — ` +
        `run \`${REGENERATE_COMMAND}\` and commit the result:`,
    )
    for (const v of stale) {
      if (v.kind === 'stale') {
        lines.push(`  ${v.path} ${v.name}: ${v.baseline} -> ${v.current === null ? `below ${threshold} or gone` : v.current}`)
      }
    }
  }
  return lines.join('\n')
}

/** A file whose above-threshold complexity rose between two baselines. */
export interface FileGrowth {
  path: string
  from: number
  to: number
}

/**
 * Per-file sum of the above-threshold values, compared between the
 * committed baseline and a regenerated one. Pairing by name cannot see a
 * hotspot that was renamed while it grew (it reads as "entered" + "stale"),
 * or two same-named closures where one left the threshold while the other
 * grew; the per-file sum can. The sum alone is not enough either: a function
 * can grow behind a sibling in the same file that got simpler by more. So
 * `--update` refuses on BOTH signals — any per-function `grew` / `entered`
 * from {@link compareToBaseline} against the committed baseline, and any
 * file whose sum rose — unless `--force` is passed. A regeneration can only
 * lower the baseline; growth is a deliberate, visible decision.
 */
export function baselineGrowth(previous: ComplexityBaseline, next: ComplexityBaseline): FileGrowth[] {
  const sumOf = (byName: Record<string, number[]> | undefined): number =>
    Object.values(byName ?? {}).reduce((n, values) => n + values.reduce((m, v) => m + v, 0), 0)
  const growth: FileGrowth[] = []
  const paths = new Set([...Object.keys(previous.files), ...Object.keys(next.files)])
  for (const path of [...paths].sort()) {
    const from = sumOf(previous.files[path])
    const to = sumOf(next.files[path])
    if (to > from) growth.push({ path, from, to })
  }
  return growth
}

/** What a regeneration would accept that the committed baseline does not. */
export interface RegenerationGrowth {
  /** Per-function: a matched function that grew, or a new one above the threshold. */
  functions: Violation[]
  /** Per-file totals that rose (catches a hotspot renamed while it grew). */
  files: FileGrowth[]
}

/**
 * Everything `--update` refuses without `--force`: the per-function
 * `grew` / `entered` violations of the tree against the COMMITTED baseline
 * (so a function cannot grow behind a sibling in the same file that got
 * simpler by more), plus {@link baselineGrowth}'s per-file totals. Stale
 * entries — the legitimate reason to regenerate — are not growth.
 */
export function regenerationGrowth(
  report: CcccReport,
  previous: ComplexityBaseline,
  next: ComplexityBaseline,
): RegenerationGrowth {
  return {
    functions: compareToBaseline(report, previous).violations.filter((v) => v.kind !== 'stale'),
    files: baselineGrowth(previous, next),
  }
}

/** Parse `cccc --version` ("cccc 1.8.0") to the bare version. */
export function parseCcccVersion(output: string): string | null {
  const match = /^cccc\s+(\S+)/m.exec(output.trim())
  return match ? match[1] : null
}
