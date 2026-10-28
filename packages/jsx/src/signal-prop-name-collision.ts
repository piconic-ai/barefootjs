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
  /** Its own initializer derives from the same-named prop. */
  selfDerived: boolean
}

/**
 * Signal getters and memos that share a name with a prop of a bare-props
 * component (`props.label` beside `const [label] = createSignal(...)` or
 * `const label = createMemo(...)`). `propNames` holds lower-cased names:
 * the comparison ignores case because a backend may fold it (Go exports
 * both `label` and `Label` as the field `Label`).
 *
 * A binding whose own initializer derives from that same prop
 * (`createSignal(props.label ?? 'x')`) is marked `selfDerived`: the
 * template-stash backends keep it on the prop's variable, seeded from the
 * raw prop (`extractSsrDefaults` decides that case with the same
 * `referencesOwnProp` test), unless the component also reads the raw prop
 * (`separateSignalPropBindings`).
 */
function collidingBindings(ctx: AnalyzerContext, propsObjectName: string, propNames: ReadonlySet<string>): SeparatedBinding[] {
  const localConsts = localConstValuesByName(ctx)
  const collides = (name: string): boolean => propNames.has(name.toLowerCase())
  const selfDerived = (name: string, derivation: string): boolean =>
    referencesOwnProp(derivation, propsObjectName, name, localConsts)
  const signals: SeparatedBinding[] = ctx.signals
    .filter(s => !s.isModule && !s.getterElided && !s.envReader && collides(s.getter))
    .map(s => ({ name: s.getter, loc: s.loc, prefix: 'bfSignal', selfDerived: selfDerived(s.getter, s.initialValue) }))
  const memos: SeparatedBinding[] = ctx.memos
    .filter(m => !m.isModule && collides(m.name))
    .map(m => ({ name: m.name, loc: m.loc, prefix: 'bfMemo', selfDerived: selfDerived(m.name, m.computation) }))
  return [...signals, ...memos]
}

/**
 * A property read off the props object (`props.label`): its lower-cased
 * name and position. `name` is null for a computed key (`props[k]`), which
 * may read any prop.
 */
interface PropsRead {
  name: string | null
  pos: number
}

/**
 * The key a props read names: an identifier member (`props.label`), or an
 * element access with a literal key (`props['label']`, `` props[`label`] ``,
 * `props[0]`), each also optional (`props?.['label']`). The key is the
 * literal's own text, so a numeric key names its number and never matches
 * an identifier. Null for a computed key. Undefined when `node` is no
 * member access off `propsObjectName`.
 */
function propsReadKey(node: ts.Node, propsObjectName: string): { receiver: ts.Identifier; key: string | null } | undefined {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
    return isNamedReceiver(node.expression, propsObjectName) ? { receiver: node.expression, key: node.name.text } : undefined
  }
  if (!ts.isElementAccessExpression(node) || !isNamedReceiver(node.expression, propsObjectName)) return undefined
  const arg = node.argumentExpression
  const literal = ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isNumericLiteral(arg)
  return { receiver: node.expression, key: literal ? arg.text : null }
}

function isNamedReceiver(expr: ts.Expression, propsObjectName: string): expr is ts.Identifier {
  return ts.isIdentifier(expr) && expr.text === propsObjectName
}

/**
 * Every property read off the props object (`props.label`,
 * `props['label']`) inside the component. An untyped `props` parameter
 * declares no `propsParams`, so these reads are its only prop names.
 * `isPropsObject` decides whether an access's receiver is the props
 * binding itself.
 */
function propsReads(
  component: ts.Node,
  propsObjectName: string,
  isPropsObject: (receiver: ts.Identifier) => boolean,
): PropsRead[] {
  const reads: PropsRead[] = []
  function visit(node: ts.Node): void {
    const read = propsReadKey(node, propsObjectName)
    if (read && isPropsObject(read.receiver)) {
      reads.push({ name: read.key === null ? null : read.key.toLowerCase(), pos: node.getStart() })
    }
    ts.forEachChild(node, visit)
  }
  visit(component)
  return reads
}

/** The prop names the reads spell; a computed-key read names none. */
function readNames(reads: readonly PropsRead[]): string[] {
  return reads.flatMap(r => (r.name === null ? [] : [r.name]))
}

/**
 * Whether `binding`, declared by `declaration`, must leave the prop's
 * name. A self-derived binding shares the prop's template variable only
 * while nothing else reads the raw prop: a `props.<name>` read outside its
 * own initializer would otherwise see the derived value. A computed-key
 * read (`props[k]`) may read that prop, so it counts too.
 */
function needsSeparation(binding: SeparatedBinding, declaration: ts.VariableDeclaration, reads: readonly PropsRead[]): boolean {
  if (!binding.selfDerived) return true
  const init = declaration.initializer
  const name = binding.name.toLowerCase()
  return reads.some(r => (r.name === null || r.name === name) && (!init || r.pos < init.getStart() || r.pos >= init.getEnd()))
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
  const propsObjectName = ctx.propsObjectName
  const component = ctx.componentNode
  if (!propsObjectName || !component) return null
  const declared = ctx.propsParams.map(p => p.name.toLowerCase())
  // Every same-spelled read is a candidate before binding resolution, so
  // the checker is built only when some binding can collide.
  const spelled = readNames(propsReads(component, propsObjectName, () => true))
  if (collidingBindings(ctx, propsObjectName, new Set([...declared, ...spelled])).length === 0) return null

  const sf = ctx.sourceFile
  const checker = ctx.checker ?? ts.createProgram([sf.fileName], { noLib: true, noResolve: true }, {
    ...ts.createCompilerHost({ noLib: true, noResolve: true }),
    getSourceFile: () => sf,
  }).getTypeChecker()
  // A read counts only when its receiver is the props parameter, not a
  // callback parameter or local that shadows the name.
  const param = component.parameters.find(p => ts.isIdentifier(p.name) && p.name.text === propsObjectName)
  const paramSymbol = param && checker.getSymbolAtLocation(param.name)
  const reads = paramSymbol
    ? propsReads(component, propsObjectName, id => checker.getSymbolAtLocation(id) === paramSymbol)
    : []
  const candidates = collidingBindings(ctx, propsObjectName, new Set([...declared, ...readNames(reads)]))
  if (candidates.length === 0) return null
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
      if (binding && needsSeparation(binding, node, reads)) {
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
  collectBindings(component)

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
  collectEdits(component)
  if (edits.length === 0) return null
  let source = sf.text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  }
  return source
}
