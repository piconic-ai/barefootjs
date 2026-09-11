#!/usr/bin/env bun
/**
 * Move D bench: hydration-props measurement + decision artifact.
 *
 * Move D of the "Prop Boundary Contract" design (spec/compiler.md, "Cross-
 * component prop elision (Move D)") asked whether a THIRD elision mechanism
 * — refining `usedProps` transitively across a component boundary so a
 * parent stops serializing a prop it only forwards to a child that never
 * reads it — is worth building on top of the two that already ship:
 *
 *   (a) `analyzeClientNeeds` (packages/jsx/src/ir-to-client-js/index.ts) —
 *       a root mount only serializes props its OWN client code reads
 *       (`usedProps`), not every prop it was given.
 *   (b) The `__bfChild` / `__bfNoSerialize` gate (packages/adapter-hono/src/
 *       adapter/hono-adapter.ts) — a compiled CHILD component never
 *       serializes props at all; it receives them live via `initChild`.
 *
 * This script produces the numbers behind that decision:
 *
 *   M1 — per-prop bf-p cost. `serializeHydrationProps` (stringify) +
 *        `JSON.parse` (mirrors the client's `parseProps` in
 *        packages/client/src/runtime/hydrate.ts) cost, measured as a linear
 *        regression SLOPE across prop count N, not the absolute cost at
 *        N=1 (which is dominated by fixed per-call overhead).
 *
 *   M2 — eligible-population census. Compiles every `.tsx` under `site/ui`
 *        and counts how many parent -> child prop forwards are BARE
 *        IDENTIFIERS naming one of the parent's own `usedProps`, and of
 *        those, how many name a prop the child's OWN `usedProps` does not
 *        contain (the residual case Move D would have to eliminate).
 *
 * Run: bun run packages/adapter-hono/bench/hydration-props-bench.ts
 *
 * Figures are wall-clock on the calling machine (see printed environment
 * line) — compare shapes/slopes, not absolute numbers across hosts.
 */

import { resolve } from 'node:path'
import { readdir } from 'node:fs/promises'
import ts from 'typescript'
import {
  compileJSX,
  createProgramForCorpus,
  TestAdapter,
  type ComponentIR,
  type IRNode,
  type AttrValue,
} from '@barefootjs/jsx'
import { serializeHydrationProps } from '../src/utils.ts'

// =============================================================================
// M1 — per-prop serialize/parse cost
// =============================================================================

type Shape = 'number' | 'string16' | 'object'

const SHAPES: Shape[] = ['number', 'string16', 'object']
const NS_LIST = [1, 5, 20, 50]
const WARMUP = 1000
const MEASURED = 200_000
const RUNS = 5

function shapeValue(shape: Shape, i: number): unknown {
  switch (shape) {
    case 'number':
      return i * 7 + 1
    case 'string16':
      // Exactly 16 characters.
      return 'abcdefghijklmnop'
    case 'object':
      return { id: i, name: `item-${i}`, tags: ['alpha', 'beta', 'gamma'] }
  }
}

function buildProps(n: number, shape: Shape): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (let i = 0; i < n; i++) {
    props[`p${i}`] = shapeValue(shape, i)
  }
  return props
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

interface CellResult {
  n: number
  shape: Shape
  stringifyNs: number
  parseNs: number
  bytes: number
}

/** One (N, shape) cell: WARMUP iterations discarded, then RUNS medians of MEASURED iterations each. */
function benchCell(n: number, shape: Shape): CellResult {
  const props = buildProps(n, shape)

  for (let i = 0; i < WARMUP; i++) {
    const json = serializeHydrationProps(props, 'Bench', {})
    if (json) JSON.parse(json)
  }

  const stringifyRunsNs: number[] = []
  const parseRunsNs: number[] = []
  let bytes = 0

  for (let run = 0; run < RUNS; run++) {
    let json: string | undefined

    const t0 = Bun.nanoseconds()
    for (let i = 0; i < MEASURED; i++) {
      json = serializeHydrationProps(props, 'Bench', {})
    }
    const t1 = Bun.nanoseconds()
    stringifyRunsNs.push((t1 - t0) / MEASURED)
    bytes = json ? json.length : 0

    const t2 = Bun.nanoseconds()
    for (let i = 0; i < MEASURED; i++) {
      JSON.parse(json as string)
    }
    const t3 = Bun.nanoseconds()
    parseRunsNs.push((t3 - t2) / MEASURED)
  }

  return {
    n,
    shape,
    stringifyNs: median(stringifyRunsNs),
    parseNs: median(parseRunsNs),
    bytes,
  }
}

/** Ordinary least-squares slope + intercept of ys against xs. */
function linreg(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0)
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0)
  const denom = n * sumXX - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

interface ShapeSlopes {
  shape: Shape
  stringify: { slope: number; intercept: number }
  parse: { slope: number; intercept: number }
  bytes: { slope: number; intercept: number }
}

function runM1(): { cells: CellResult[]; slopes: ShapeSlopes[] } {
  const cells: CellResult[] = []
  for (const shape of SHAPES) {
    for (const n of NS_LIST) {
      cells.push(benchCell(n, shape))
    }
  }

  const slopes: ShapeSlopes[] = SHAPES.map((shape) => {
    const rows = cells.filter((c) => c.shape === shape)
    const xs = rows.map((r) => r.n)
    return {
      shape,
      stringify: linreg(xs, rows.map((r) => r.stringifyNs)),
      parse: linreg(xs, rows.map((r) => r.parseNs)),
      bytes: linreg(xs, rows.map((r) => r.bytes)),
    }
  })

  return { cells, slopes }
}

function printM1(cells: CellResult[], slopes: ShapeSlopes[]): void {
  console.log('\n=== M1: per-prop bf-p cost ===\n')
  console.log(
    'shape'.padEnd(10) +
      'N'.padStart(5) +
      'stringify(ns)'.padStart(16) +
      'parse(ns)'.padStart(12) +
      'bytes'.padStart(8),
  )
  for (const c of cells) {
    console.log(
      c.shape.padEnd(10) +
        String(c.n).padStart(5) +
        c.stringifyNs.toFixed(1).padStart(16) +
        c.parseNs.toFixed(1).padStart(12) +
        String(c.bytes).padStart(8),
    )
  }

  console.log('\n--- linear regression across N (slope = cost per additional prop) ---\n')
  console.log(
    'shape'.padEnd(10) +
      'stringify ns/prop'.padStart(20) +
      'stringify intercept'.padStart(22) +
      'parse ns/prop'.padStart(16) +
      'parse intercept'.padStart(18) +
      'bytes/prop'.padStart(13) +
      'bytes intercept'.padStart(18),
  )
  for (const s of slopes) {
    console.log(
      s.shape.padEnd(10) +
        s.stringify.slope.toFixed(2).padStart(20) +
        s.stringify.intercept.toFixed(1).padStart(22) +
        s.parse.slope.toFixed(2).padStart(16) +
        s.parse.intercept.toFixed(1).padStart(18) +
        s.bytes.slope.toFixed(2).padStart(13) +
        s.bytes.intercept.toFixed(1).padStart(18),
    )
  }
}

// =============================================================================
// M2 — eligible-population census
// =============================================================================

/**
 * Mirrors `findTsxFiles` in packages/jsx/bench/compiler-bench.ts. Not
 * imported directly — it is a private helper of that bench script, not a
 * package export, and this script lives in a different package
 * (`@barefootjs/hono`) — so the walk is duplicated verbatim rather than
 * reached across a package boundary that isn't a real dependency edge.
 */
async function findTsxFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await findTsxFiles(full)))
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.') && !entry.name.includes('.preview.')) {
      out.push(full)
    }
  }
  return out
}

const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function bareIdentifierOf(value: AttrValue): string | null {
  if (value.kind !== 'expression') return null
  const expr = value.expr.trim()
  return BARE_IDENTIFIER.test(expr) ? expr : null
}

interface ForwardedProp {
  parentName: string
  childName: string
  propName: string
}

/** A prop-bearing occurrence of a child component: an `IRComponent` node
 *  or a loop row (`IRLoopChildComponent`) — both carry `{ name, props }`. */
interface ComponentOccurrence {
  name: string
  props: Array<{ name: string; value: AttrValue }>
}

function checkOccurrence(
  occ: ComponentOccurrence,
  parentName: string,
  parentUsedProps: ReadonlySet<string>,
  out: ForwardedProp[],
): void {
  for (const prop of occ.props) {
    const ident = bareIdentifierOf(prop.value)
    if (ident && parentUsedProps.has(ident)) {
      out.push({ parentName, childName: occ.name, propName: ident })
    }
  }
}

/** Walk one component's IR tree, recording every bare-identifier prop
 *  forward that names one of the PARENT's own `usedProps`. */
function collectForwardedProps(
  node: IRNode,
  parentName: string,
  parentUsedProps: ReadonlySet<string>,
  out: ForwardedProp[],
): void {
  switch (node.type) {
    case 'component': {
      checkOccurrence(node, parentName, parentUsedProps, out)
      for (const prop of node.props) {
        if (prop.value.kind === 'jsx-children') {
          for (const child of prop.value.children) {
            collectForwardedProps(child, parentName, parentUsedProps, out)
          }
        }
      }
      for (const child of node.children) collectForwardedProps(child, parentName, parentUsedProps, out)
      break
    }
    case 'element':
    case 'fragment':
    case 'provider':
      for (const child of node.children) collectForwardedProps(child, parentName, parentUsedProps, out)
      break
    case 'conditional':
      collectForwardedProps(node.whenTrue, parentName, parentUsedProps, out)
      collectForwardedProps(node.whenFalse, parentName, parentUsedProps, out)
      break
    case 'if-statement':
      collectForwardedProps(node.consequent, parentName, parentUsedProps, out)
      if (node.alternate) collectForwardedProps(node.alternate, parentName, parentUsedProps, out)
      break
    case 'loop': {
      for (const child of node.children) collectForwardedProps(child, parentName, parentUsedProps, out)
      if (node.childComponent) {
        checkOccurrence(node.childComponent, parentName, parentUsedProps, out)
        for (const child of node.childComponent.children) {
          collectForwardedProps(child, parentName, parentUsedProps, out)
        }
      }
      for (const nested of node.nestedComponents ?? []) {
        checkOccurrence(nested, parentName, parentUsedProps, out)
        for (const child of nested.children) {
          collectForwardedProps(child, parentName, parentUsedProps, out)
        }
      }
      break
    }
    case 'async':
      collectForwardedProps(node.fallback, parentName, parentUsedProps, out)
      for (const child of node.children) collectForwardedProps(child, parentName, parentUsedProps, out)
      break
    case 'slot':
    case 'text':
    case 'expression':
      break
  }
}

interface M2Result {
  totalComponents: number
  componentsWithUsedProps: number
  totalForwarded: number
  eligible: number
  unresolvedChild: number
  examples: ForwardedProp[]
}

async function runM2(): Promise<M2Result> {
  const corpus = resolve(import.meta.dirname, '../../../site/ui')
  const files = await findTsxFiles(corpus)

  const program = createProgramForCorpus(files, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
  })
  const adapter = new TestAdapter()

  const componentIRs: ComponentIR[] = []

  // `usedProps` is computed before client-JS pruning runs, so the census
  // below is unaffected by it — but a handful of `site/ui` files trip
  // `pruneUnusedPropExtractions`'s internal `console.warn` (pre-existing,
  // unrelated to Move D). Silenced here so the printed report stays clean.
  const realWarn = console.warn
  console.warn = () => {}
  try {
    for (const filePath of files) {
      const source = await Bun.file(filePath).text()
      let result: ReturnType<typeof compileJSX>
      try {
        result = compileJSX(source, filePath, { adapter, program, outputIR: true })
      } catch {
        continue
      }
      for (const file of result.files) {
        if (file.type !== 'ir') continue
        try {
          componentIRs.push(JSON.parse(file.content) as ComponentIR)
        } catch {
          // Skip IR that failed to round-trip through JSON (shouldn't happen —
          // compileJSX writes it via JSON.stringify itself).
        }
      }
    }
  } finally {
    console.warn = realWarn
  }

  // componentName -> usedProps, built across the WHOLE corpus so a child
  // defined in a different file than its parent still resolves.
  const usedPropsByName = new Map<string, Set<string>>()
  for (const ir of componentIRs) {
    const usedProps = ir.metadata.clientAnalysis?.usedProps ?? []
    usedPropsByName.set(ir.metadata.componentName, new Set(usedProps))
  }

  const forwarded: ForwardedProp[] = []
  for (const ir of componentIRs) {
    const parentUsedProps = usedPropsByName.get(ir.metadata.componentName) ?? new Set()
    if (parentUsedProps.size === 0) continue
    collectForwardedProps(ir.root, ir.metadata.componentName, parentUsedProps, forwarded)
  }

  let eligible = 0
  let unresolvedChild = 0
  const examples: ForwardedProp[] = []
  for (const fwd of forwarded) {
    const childUsedProps = usedPropsByName.get(fwd.childName)
    if (!childUsedProps) {
      unresolvedChild++
      continue
    }
    if (!childUsedProps.has(fwd.propName)) {
      eligible++
      if (examples.length < 10) examples.push(fwd)
    }
  }

  const componentsWithUsedProps = [...usedPropsByName.values()].filter((s) => s.size > 0).length

  return {
    totalComponents: componentIRs.length,
    componentsWithUsedProps,
    totalForwarded: forwarded.length,
    eligible,
    unresolvedChild,
    examples,
  }
}

function printM2(result: M2Result, slopes: ShapeSlopes[]): void {
  console.log('\n=== M2: eligible-population census (site/ui) ===\n')
  console.log(`components compiled: ${result.totalComponents}`)
  console.log(`components with a non-empty usedProps (candidate parents): ${result.componentsWithUsedProps}`)
  console.log(`total bare-identifier prop forwards matching parent usedProps: ${result.totalForwarded}`)
  console.log(`  of which child component unresolved (skipped from eligible): ${result.unresolvedChild}`)
  console.log(`eligible (child's own usedProps does NOT contain the forwarded name): ${result.eligible}`)
  const ratio = result.totalForwarded === 0 ? 0 : result.eligible / result.totalForwarded
  console.log(`eligible / total forwarded ratio: ${(ratio * 100).toFixed(1)}%`)

  if (result.examples.length > 0) {
    console.log('\nexamples (up to 10):')
    for (const ex of result.examples) {
      console.log(`  <${ex.parentName}> -> <${ex.childName}> prop "${ex.propName}"`)
    }
  }

  console.log('\n--- estimated total savings (eligible count x M1 slope) ---')
  for (const s of slopes) {
    const stringifyNs = result.eligible * s.stringify.slope
    const parseNs = result.eligible * s.parse.slope
    const bytesTotal = result.eligible * s.bytes.slope
    console.log(
      `  ${s.shape.padEnd(10)} stringify: ${(stringifyNs / 1000).toFixed(2)} us total` +
        `  parse: ${(parseNs / 1000).toFixed(2)} us total` +
        `  bytes: ${bytesTotal.toFixed(1)} bytes total`,
    )
  }
}

// =============================================================================
// main
// =============================================================================

async function main(): Promise<void> {
  console.log(`environment: bun ${Bun.version}, ${process.platform}/${process.arch}, measured ${new Date().toISOString()}`)

  const { cells, slopes } = runM1()
  printM1(cells, slopes)

  const m2 = await runM2()
  printM2(m2, slopes)
}

main()
