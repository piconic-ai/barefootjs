import ts from 'typescript'
import path from 'node:path'
import type { AnalyzerContext } from './analyzer-context.ts'
import type { ParsedExpr } from './expression-parser.ts'

/** Preserve a build-supplied Program's virtual files and resolution options
 * when one root's source changes. Other SourceFiles remain untouched. */
export function programWithSeparatedSource(program: ts.Program, filePath: string, source: string): ts.Program {
  const options = program.getCompilerOptions()
  const host = ts.createCompilerHost(options)
  const directory = program.getCurrentDirectory()
  const target = path.resolve(directory, filePath)
  const matches = (name: string) => path.resolve(directory, name) === target
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
  return ts.createProgram(program.getRootFileNames(), options, {
    ...host,
    getCurrentDirectory: () => directory,
    directoryExists: name => virtualDirectories.has(path.resolve(directory, name)) || host.directoryExists!(name),
    fileExists: name => matches(name) || program.getSourceFile(name) !== undefined || host.fileExists(name),
    readFile: name => matches(name) ? source : program.getSourceFile(name)?.text ?? host.readFile(name),
    getSourceFile: (name, version, onError, shouldCreateNewSourceFile) => matches(name)
      ? ts.createSourceFile(name, source, version, true, ts.ScriptKind.TSX)
      : program.getSourceFile(name) ?? host.getSourceFile(name, version, onError, shouldCreateNewSourceFile),
  })
}

function isLiteralTree(expr: ParsedExpr): boolean {
  switch (expr.kind) {
    case 'literal': return true
    case 'array-literal': return expr.elements.every(isLiteralTree)
    case 'object-literal': return expr.properties.every(p => p.kind === 'prop' && isLiteralTree(p.value))
    case 'unary': return ['-', '+'].includes(expr.op) && expr.argument.kind === 'literal' && expr.argument.literalType === 'number'
    default: return false
  }
}

/**
 * A bare prop and a literal-seeded getter are different JS bindings, but
 * scalar template backends flatten both to one variable. Give the local
 * getter a hygienic name before building IR, so every backend (including
 * the client emitter) receives one consistent binding identity.
 *
 * Source edits are AST/symbol-based and preserve untouched source bytes.
 * Property keys, strings, and shadowing callback bindings never rename;
 * shorthand values expand without changing their public keys. The rare
 * collision-only path reuses the analyzer's checker when available. Its
 * fallback binds the already-parsed SourceFile without parsing or loading
 * dependencies: only lexical symbol identity is needed, not types.
 */
export function separateLiteralSignalPropBindings(
  ctx: AnalyzerContext,
  isNonReference: (id: ts.Identifier) => boolean,
): string | null {
  if (!ctx.propsObjectName || !ctx.componentNode) return null
  const propNames = new Set(ctx.propsParams.map(p => p.name))
  const candidates = ctx.signals.filter(s =>
    !s.isModule && !s.getterElided && propNames.has(s.getter) && s.parsed && isLiteralTree(s.parsed),
  )
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

  const renames = new Map<ts.Symbol, string>()
  const declarations = new Map(candidates.map(s => [
    sf.getPositionOfLineAndCharacter(s.loc.start.line - 1, s.loc.start.column), s,
  ]))
  function collectBindings(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      const signal = declarations.get(node.getStart(sf))
      if (signal) {
        const names = ts.isIdentifier(node.name) ? [node.name]
          : ts.isArrayBindingPattern(node.name)
            ? node.name.elements.flatMap(e => ts.isBindingElement(e) && ts.isIdentifier(e.name) ? [e.name] : [])
            : []
        const id = names.find(n => n.text === signal.getter)
        const symbol = id && checker.getSymbolAtLocation(id)
        if (symbol) {
          const base = `bfSignal_${signal.getter}`
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
