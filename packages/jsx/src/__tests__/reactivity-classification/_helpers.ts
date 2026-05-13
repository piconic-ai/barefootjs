/**
 * Shared helpers for reactivity-classification tests.
 *
 * These tests pin down the *post-refactor* contract for issue #1248 + #1251:
 * a single classification pipeline backed by `OriginInfo.freeRefs` with no
 * silent regex fallback. They are expected to fail until the refactor lands.
 */

import ts from 'typescript'
import path from 'path'
import { analyzeComponent } from '../../analyzer'
import { jsxToIR } from '../../jsx-to-ir'
import { generateClientJs } from '../../ir-to-client-js'
import { buildMetadata } from '../../compiler'
import type {
  ComponentIR,
  IRExpression,
  IRConditional,
  IRNode,
  FreeReference,
} from '../../types'

/**
 * Convenience alias so the `kinds` rest parameter type in
 * `hasFreeRefKind` reads at call sites as a domain-level "binding kind"
 * rather than indexing through `FreeReference['kind']`.
 */
type FreeRefKind = FreeReference['kind']

/**
 * Build a ts.Program from in-memory sources. Use this when the test exercises
 * the TypeChecker (e.g. library-getter brand detection).
 */
export function createInMemoryProgram(
  files: Record<string, string>,
  entryFile: string
): { program: ts.Program; entryPath: string } {
  const baseDir = path.resolve(__dirname)
  const resolvedFiles = new Map<string, string>()
  for (const [name, content] of Object.entries(files)) {
    resolvedFiles.set(path.join(baseDir, name), content)
  }

  const entryPath = path.join(baseDir, entryFile)

  const opts: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  }
  const defaultHost = ts.createCompilerHost(opts)
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(name, lang) {
      const resolved = path.resolve(name)
      const text = resolvedFiles.get(resolved)
      if (text !== undefined) return ts.createSourceFile(name, text, lang, true, ts.ScriptKind.TSX)
      return defaultHost.getSourceFile(name, lang)
    },
    fileExists(name) {
      return resolvedFiles.has(path.resolve(name)) || defaultHost.fileExists(name)
    },
    readFile(name) {
      const text = resolvedFiles.get(path.resolve(name))
      return text !== undefined ? text : defaultHost.readFile(name)
    },
  }

  return { program: ts.createProgram([entryPath], opts, host), entryPath }
}

/**
 * Run Phase 1 (analyzer + jsxToIR) on a source and return a ComponentIR.
 * `program` is optional for cases that intentionally exercise the
 * "no shared Program" failure mode.
 */
export function compileToComponentIR(
  source: string,
  filePath: string,
  program?: ts.Program
): { componentIR: ComponentIR | null; analyzerErrors: ReturnType<typeof analyzeComponent>['errors'] } {
  const ctx = analyzeComponent(source, filePath, undefined, program)
  if (!ctx.jsxReturn) {
    return { componentIR: null, analyzerErrors: ctx.errors }
  }
  const root = jsxToIR(ctx)
  if (!root) {
    return { componentIR: null, analyzerErrors: ctx.errors }
  }
  const componentIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx, ''),
    root,
    errors: [],
  }
  return { componentIR, analyzerErrors: ctx.errors }
}

/**
 * Run Phase 2 on a ComponentIR and return the generated client JS string.
 */
export function compileToClientJs(componentIR: ComponentIR): string {
  return generateClientJs(componentIR)
}

/**
 * Walk an IR tree and collect every `IRExpression` node.
 */
export function collectExpressions(root: IRNode | null): IRExpression[] {
  if (!root) return []
  const out: IRExpression[] = []
  const walk = (n: any) => {
    if (!n) return
    if (n.type === 'expression') out.push(n)
    if (n.type === 'conditional') {
      walk(n.whenTrue)
      walk(n.whenFalse)
    }
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(root as any)
  return out
}

/**
 * Walk an IR tree and collect every `IRConditional` node.
 */
export function collectConditionals(root: IRNode | null): IRConditional[] {
  if (!root) return []
  const out: IRConditional[] = []
  const walk = (n: any) => {
    if (!n) return
    if (n.type === 'conditional') {
      out.push(n)
      walk(n.whenTrue)
      walk(n.whenFalse)
    }
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(root as any)
  return out
}

/**
 * True when `freeRefs` carries at least one entry whose `kind` matches
 * any of the supplied names. Accepts post-refactor kinds as strings.
 */
export function hasFreeRefKind(
  freeRefs: FreeReference[] | undefined,
  ...kinds: FreeRefKind[]
): boolean {
  if (!freeRefs) return false
  const set = new Set<string>(kinds)
  return freeRefs.some(r => set.has(r.kind as string))
}

/**
 * Match an effect/createEffect wrap in emitted client JS.
 */
export const EFFECT_WRAP_RE = /createEffect\s*\(|__bf\.effect\s*\(|\beffect\s*\(/
