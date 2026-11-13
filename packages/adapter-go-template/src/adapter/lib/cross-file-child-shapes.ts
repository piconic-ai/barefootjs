/**
 * Cross-file child shapes resolved from the child's own source, so a parent
 * compiles the same whatever order the files of a build compile in (#3753).
 *
 * A parent reads a child's shape (`ChildComponentShape`: its declared
 * params, rest bag, nillable and `bf.Opt` fields) to build the child's
 * `<Child>Input{...}` literal. `@barefootjs/vite` compiles every component
 * onto ONE adapter in discovery order and never registers a shape across
 * files, so a parent used to see a child's shape only when the child's file
 * happened to compile first and declared more than one component
 * (`compileMultipleComponents` registers its own components). A
 * `data-slot` passed to a child that collects it in a rest bag was dropped
 * or delivered depending on the two files' names.
 *
 * Here the parent reads each relatively imported file that declares a
 * component from disk and registers its components' shapes before it
 * generates, as the conformance harnesses register every sibling's. The
 * IR comes from `compileJSX` itself, on a separate adapter instance whose
 * output is discarded, so it is the IR the child's own compile builds and
 * registers. A file is compiled again only when its content changed, so a
 * dev rebuild sees an edited child. Mirrors `ensureCrossFileTypes` (#2992),
 * the same on-demand read for the types a parent imports.
 *
 * Relative imports only: an aliased specifier (`@/components/ui/icon`) is
 * not resolved here.
 */

import { readFileSync } from 'node:fs'
import { listComponentFunctions, resolveRelativeImportToFile, type ComponentIR, type ImportInfo } from '@barefootjs/jsx'

export interface CrossFileChildShapeHost {
  /** Absolute path → the content its shapes were registered from. */
  readonly scannedChildShapeSources: Map<string, string>
  /** The IRs `compileJSX` builds for `source`, compiled off this adapter's state. */
  compileComponentIrs(source: string, filePath: string): ComponentIR[]
  /** `registerChildComponentShape`. */
  registerChildComponentShape(ir: ComponentIR): void
}

/**
 * Register the shape of every component a relative import in `imports`
 * names a file of, grandchildren first: a child's nillable params depend on
 * the children it forwards them to (`collectNillableForwardedPropNames`).
 */
export function ensureCrossFileChildShapes(host: CrossFileChildShapeHost, imports: readonly ImportInfo[] | undefined): void {
  for (const imp of imports ?? []) {
    if (imp.isTypeOnly || !imp.source.startsWith('.')) continue
    if (!imp.specifiers.some(spec => !spec.isTypeOnly)) continue
    const resolved = resolveRelativeImportToFile(imp.source, imp.loc.file)
    if (!resolved) continue
    let source: string
    try {
      source = readFileSync(resolved, 'utf8')
    } catch {
      continue
    }
    if (host.scannedChildShapeSources.get(resolved) === source) continue
    // Recorded before the recursion below, so an import cycle stops here.
    host.scannedChildShapeSources.set(resolved, source)
    if (listComponentFunctions(source, resolved).length === 0) continue
    const irs = host.compileComponentIrs(source, resolved)
    for (const ir of irs) ensureCrossFileChildShapes(host, ir.metadata.imports)
    for (const ir of irs) host.registerChildComponentShape(ir)
  }
}
