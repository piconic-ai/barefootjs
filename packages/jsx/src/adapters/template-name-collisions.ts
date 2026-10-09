import { BindingScope } from '../scope/binding-scope.ts'
import type { CompilerError, ComponentIR, IRNode } from '../types.ts'

/**
 * BF105: two distinct source names of a component that an adapter's
 * identifier mangling turns into the SAME template variable (#3404).
 *
 * Template engines without a variable sigil (Jinja, MiniJinja, Twig, Pebble)
 * rename a source name the engine reserves — `loop` becomes `__bf_loop`,
 * `none` becomes `none_`. The mapping is per name and must be idempotent
 * (some paths mangle an already-mangled name, and the runtimes re-mangle
 * prop keys), so it cannot also be injective: whatever a reserved name
 * becomes is itself a name a user may write. When a component writes both,
 * the two reads would silently share one value, so the adapter refuses.
 *
 * The names checked are the ones the adapter turns into bare template
 * variables: props, local consts and functions, signal getters and setters,
 * memos, and the bindings of each loop row or `.filter()` callback together
 * with its enclosing rows (`BindingScope`). `ident` is the adapter's own mangling
 * (`jinjaIdent`, `twigIdent`, …). One error per colliding group.
 */
export function templateNameCollisionErrors(
  ir: ComponentIR,
  propNames: Iterable<string>,
  ident: (name: string) => string,
  adapterName: string,
  componentName: string,
): CompilerError[] {
  const { metadata } = ir
  const rootNames = new Set<string>([
    ...propNames,
    ...metadata.localConstants.map(c => c.name),
    ...metadata.localFunctions.map(f => f.name),
    ...metadata.signals.flatMap(s => (s.setter ? [s.getter, s.setter] : [s.getter])),
    ...metadata.memos.map(m => m.name),
  ])
  const errors: CompilerError[] = []
  const reported = new Set<string>()
  // Only names visible at the same point can collide: the component's own
  // names plus the bindings of the enclosing loop rows. Sibling loops never
  // see each other's bindings, so `a.map(loop => …)` next to
  // `b.map(__bf_loop => …)` is fine.
  const check = (scope: BindingScope): void => {
    const byTarget = new Map<string, string[]>()
    for (const name of new Set([...rootNames, ...scope.boundNames()])) {
      const target = ident(name)
      const group = byTarget.get(target)
      if (group) group.push(name)
      else byTarget.set(target, [name])
    }
    for (const [target, group] of byTarget) {
      if (group.length < 2) continue
      const key = `${target}\0${[...group].sort().join('\0')}`
      if (reported.has(key)) continue
      reported.add(key)
      const list = group.map(n => `\`${n}\``).join(' and ')
      errors.push({
        code: 'BF105',
        severity: 'error',
        message: `${list} both become the ${adapterName} template variable \`${target}\`, so they would read the same value. ${adapterName} reserves some names and renames them, and the new name collides with another name in this component.`,
        loc: { file: `${componentName}.tsx`, start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: `Rename one of ${list} so the two names stay distinct after the ${adapterName} renaming.`,
          escape: [{ kind: 'rewrite' }],
        },
      })
    }
  }
  const visit = (node: IRNode | null | undefined, scope: BindingScope): void => {
    if (!node) return
    switch (node.type) {
      case 'element':
      case 'component':
      case 'fragment':
      case 'provider':
        for (const child of node.children) visit(child, scope)
        break
      case 'async':
        visit(node.fallback, scope)
        for (const child of node.children) visit(child, scope)
        break
      case 'loop': {
        // A `.filter()` predicate is its own callback: its param sees the
        // enclosing scope, not the map row it feeds.
        if (node.filterPredicate) check(scope.enterCallback([node.filterPredicate.param]))
        const row = scope.enterLoopRow(node)
        check(row)
        for (const child of node.children) visit(child, row)
        if (node.childComponent) {
          for (const child of node.childComponent.children) visit(child, row)
        }
        for (const nested of node.nestedComponents ?? []) {
          for (const child of nested.children) visit(child, row)
        }
        for (const seg of node.flatMapCallback?.segments ?? []) {
          if (seg.kind === 'jsx') visit(seg.ir, row)
        }
        for (const seg of node.preamble?.segments ?? []) {
          if (seg.kind === 'jsx') visit(seg.ir, row)
        }
        break
      }
      case 'conditional':
        visit(node.whenTrue, scope)
        visit(node.whenFalse, scope)
        break
      case 'if-statement':
        visit(node.consequent, scope)
        if (node.alternate) visit(node.alternate, scope)
        break
      case 'text':
      case 'expression':
      case 'slot':
        break
    }
  }
  check(BindingScope.EMPTY)
  visit(ir.root, BindingScope.EMPTY)
  return errors
}
