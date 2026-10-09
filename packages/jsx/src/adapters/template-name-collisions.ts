import { collectLoopBoundNames } from './loop-bound-names.ts'
import type { CompilerError, ComponentIR } from '../types.ts'

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
 * memos, and every loop binding. `ident` is the adapter's own mangling
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
  const names = new Set<string>([
    ...propNames,
    ...metadata.localConstants.map(c => c.name),
    ...metadata.localFunctions.map(f => f.name),
    ...metadata.signals.flatMap(s => (s.setter ? [s.getter, s.setter] : [s.getter])),
    ...metadata.memos.map(m => m.name),
    ...collectLoopBoundNames(ir),
  ])
  const byTarget = new Map<string, string[]>()
  for (const name of names) {
    const target = ident(name)
    const group = byTarget.get(target)
    if (group) group.push(name)
    else byTarget.set(target, [name])
  }
  const errors: CompilerError[] = []
  for (const [target, group] of byTarget) {
    if (group.length < 2) continue
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
  return errors
}
