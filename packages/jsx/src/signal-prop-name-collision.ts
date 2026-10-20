import ts from 'typescript'
import path from 'node:path'
import type { AnalyzerContext } from './analyzer-context.ts'
import type { SourceLocation } from './types.ts'
import { localConstValuesByName, referencesOwnProp } from './ssr-defaults.ts'

// TypeScript exposes these resolution-cache readers on Program at runtime
// (its own incremental rebuild uses them), but omits them from the public
// declaration. Replaying the resolved graph preserves custom host hooks:
// renaming a local binding never changes any import or type directive.
type ResolvedProgram = ts.Program & {
  getResolvedModule(file: ts.SourceFile, name: string, mode: ts.ResolutionMode): ts.ResolvedModuleWithFailedLookupLocations | undefined
  getResolvedTypeReferenceDirective(file: ts.SourceFile, name: string, mode: ts.ResolutionMode): ts.ResolvedTypeReferenceDirectiveWithFailedLookupLocations | undefined
  getAutomaticTypeDirectiveResolutions(): { get(name: string, mode: ts.ResolutionMode): ts.ResolvedTypeReferenceDirectiveWithFailedLookupLocations | undefined }
}

/** Preserve a build-supplied Program's virtual files and resolution options
 * when one root's source changes. Other SourceFiles remain untouched. */
export function programWithSeparatedSource(program: ts.Program, filePath: string, source: string): ts.Program {
  const options = program.getCompilerOptions()
  const host = ts.createCompilerHost(options)
  const directory = program.getCurrentDirectory()
  const target = path.resolve(directory, filePath)
  const matches = (name: string) => path.resolve(directory, name) === target
  const resolvedProgram = program as ResolvedProgram
  const virtualDirectories = new Set<string>()
  for (const file of program.getSourceFiles()) {
    let dir = path.dirname(path.resolve(directory, file.fileName))
    while (!virtualDirectories.has(dir)) {
      virtualDirectories.add(dir)
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return ts.createProgram({ rootNames: program.getRootFileNames(), options, projectReferences: program.getProjectReferences(), host: {
    ...host,
    getCurrentDirectory: () => directory,
    resolveModuleNameLiterals: (literals, containingFile, redirected, compilerOptions, containingSourceFile) => {
      const original = program.getSourceFile(containingFile)
      return literals.map(literal => {
        const mode = program.getModeForUsageLocation(containingSourceFile, literal)
        return (original && resolvedProgram.getResolvedModule(original, literal.text, mode))
          ?? ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, undefined, redirected, mode)
      })
    },
    resolveTypeReferenceDirectiveReferences: (references, containingFile, redirected, compilerOptions, containingSourceFile) => {
      const original = program.getSourceFile(containingFile)
      return references.map(reference => {
        const name = typeof reference === 'string' ? reference : reference.fileName
        const mode = ts.getModeForFileReference(reference, containingSourceFile?.impliedNodeFormat)
        return (original ? resolvedProgram.getResolvedTypeReferenceDirective(original, name, mode)
          : resolvedProgram.getAutomaticTypeDirectiveResolutions().get(name, mode))
          ?? ts.resolveTypeReferenceDirective(name, containingFile, compilerOptions, host, redirected, undefined, mode)
      })
    },
    directoryExists: name => virtualDirectories.has(path.resolve(directory, name)) || host.directoryExists!(name),
    fileExists: name => matches(name) || program.getSourceFile(name) !== undefined || host.fileExists(name),
    readFile: name => matches(name) ? source : program.getSourceFile(name)?.text ?? host.readFile(name),
    getSourceFile: (name, version, onError, shouldCreateNewSourceFile) => {
      if (!matches(name)) return program.getSourceFile(name) ?? host.getSourceFile(name, version, onError, shouldCreateNewSourceFile)
      const file = ts.createSourceFile(name, source, version, true, ts.ScriptKind.TSX)
      file.impliedNodeFormat = program.getSourceFile(name)?.impliedNodeFormat
      return file
    },
  } })
}

/** A component-scope signal getter or memo whose binding is renamed. */
interface SeparatedBinding {
  name: string
  loc: SourceLocation
  prefix: 'bfSignal' | 'bfMemo'
}

/**
 * Signal getters and memos that share a name with a prop of a bare-props
 * component (`props.label` beside `const [label] = createSignal(...)` or
 * `const label = createMemo(...)`). The comparison ignores case because a
 * backend may fold it (Go exports both `label` and `Label` as the field
 * `Label`).
 *
 * A binding whose own initializer derives from that same prop
 * (`createSignal(props.label ?? 'x')`) is left alone: the template-stash
 * backends keep it on the prop's variable, seeded from the raw prop, and
 * `extractSsrDefaults` decides that case with the same `referencesOwnProp`
 * test. A raw `props.label` read beside such a binding then sees the
 * derived value (limitation `signal-from-same-named-prop-raw-read`).
 */
function collidingBindings(ctx: AnalyzerContext, propsObjectName: string): SeparatedBinding[] {
  const propNames = new Set(ctx.propsParams.map(p => p.name.toLowerCase()))
  const localConsts = localConstValuesByName(ctx)
  const collides = (name: string, derivation: string): boolean =>
    propNames.has(name.toLowerCase()) && !referencesOwnProp(derivation, propsObjectName, name, localConsts)
  const signals: SeparatedBinding[] = ctx.signals
    .filter(s => !s.isModule && !s.getterElided && !s.envReader && collides(s.getter, s.initialValue))
    .map(s => ({ name: s.getter, loc: s.loc, prefix: 'bfSignal' }))
  const memos: SeparatedBinding[] = ctx.memos
    .filter(m => !m.isModule && collides(m.name, m.computation))
    .map(m => ({ name: m.name, loc: m.loc, prefix: 'bfMemo' }))
  return [...signals, ...memos]
}

/**
 * A prop and a signal getter or memo of the same name are different JS
 * bindings (`props.label` and `label()`), but scalar template backends
 * flatten both to one variable. Give the local binding a hygienic name
 * before building IR, so every backend (including the client emitter)
 * receives one consistent binding identity.
 *
 * Source edits are AST/symbol-based and preserve untouched source bytes.
 * Property keys, strings, and shadowing callback bindings never rename;
 * shorthand values expand without changing their public keys. The rare
 * collision-only path reuses the analyzer's checker when available. Its
 * fallback binds the already-parsed SourceFile without parsing or loading
 * dependencies: only lexical symbol identity is needed, not types.
 */
export function separateSignalPropBindings(
  ctx: AnalyzerContext,
  isNonReference: (id: ts.Identifier) => boolean,
): string | null {
  if (!ctx.propsObjectName || !ctx.componentNode) return null
  const candidates = collidingBindings(ctx, ctx.propsObjectName)
  if (candidates.length === 0) return null

  const sf = ctx.sourceFile
  const checker = ctx.checker ?? ts.createProgram([sf.fileName], { noLib: true, noResolve: true }, {
    ...ts.createCompilerHost({ noLib: true, noResolve: true }),
    getSourceFile: () => sf,
  }).getTypeChecker()
  const occupied = new Set<string>()
  function collectNames(node: ts.Node): void {
    // Also avoid case-fold collisions introduced by backend field naming.
    if (ts.isIdentifier(node)) occupied.add(node.text.toLowerCase())
    ts.forEachChild(node, collectNames)
  }
  collectNames(sf)
  // A prop typed by an imported interface has no identifier in this file.
  for (const p of ctx.propsParams) occupied.add(p.name.toLowerCase())

  const renames = new Map<ts.Symbol, string>()
  const declarations = new Map(candidates.map(b => [
    sf.getPositionOfLineAndCharacter(b.loc.start.line - 1, b.loc.start.column), b,
  ]))
  function collectBindings(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      const binding = declarations.get(node.getStart(sf))
      if (binding) {
        const names = ts.isIdentifier(node.name) ? [node.name]
          : ts.isArrayBindingPattern(node.name)
            ? node.name.elements.flatMap(e => ts.isBindingElement(e) && ts.isIdentifier(e.name) ? [e.name] : [])
            : []
        const id = names.find(n => n.text === binding.name)
        const symbol = id && checker.getSymbolAtLocation(id)
        if (symbol) {
          const base = `${binding.prefix}_${binding.name}`
          let name = base
          let suffix = 0
          while (occupied.has(name.toLowerCase())) name = `${base}_${++suffix}`
          occupied.add(name.toLowerCase())
          renames.set(symbol, name)
        }
      }
    }
    ts.forEachChild(node, collectBindings)
  }
  collectBindings(ctx.componentNode)

  const edits: { start: number; end: number; text: string }[] = []
  function collectEdits(node: ts.Node): void {
    if (ts.isIdentifier(node) && !isNonReference(node)) {
      const parent = node.parent
      const shorthand = ts.isShorthandPropertyAssignment(parent) && parent.name === node
      const symbol = shorthand ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node)
      const name = symbol && renames.get(symbol)
      if (name) edits.push({
        start: node.getStart(sf), end: node.getEnd(),
        text: shorthand ? `${node.text}: ${name}` : name,
      })
    }
    ts.forEachChild(node, collectEdits)
  }
  collectEdits(ctx.componentNode)
  if (edits.length === 0) return null
  let source = sf.text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  }
  return source
}
