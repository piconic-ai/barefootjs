/**
 * BF101 for a computed destructure default no template can apply (#3725).
 *
 * A backend applies a computed default when it renders, from the expression
 * the default stands for once the consts and functions it reads are
 * resolved (`appliedPropDefaults`). A default reading a component
 * declaration with no such value (a signal, a memo, a `let`, a reassigned
 * const, a function with parameters or statements, a const declared after
 * the destructure) leaves nothing to apply, so an omitted prop would render
 * empty where JS renders the default.
 *
 * Only a prop the server render reads is refused (`walkServerReads`): in a
 * position, through a signal seed, a memo body or a const, or through
 * another prop's default. A prop only an event handler reads (`{ onDone =
 * handleDone }`) never renders its default on the server.
 */

import { freeIdentifiers } from '../expression-parser.ts'
import { walkServerReads, type ServerReadWalkOptions } from '../server-read-walk.ts'
import { appliedPropDefaults, type PropDefaultApplication } from '../ssr-seed-plan.ts'
import type { CompilerError, ComponentIR } from '../types.ts'

/** Where {@link refuseUnappliedPropDefaults} records its errors. */
export interface UnappliedPropDefaultSink {
  readonly errors: CompilerError[]
  readonly componentName: string
}

/** Record BF101 for each prop the server render reads whose computed default no template can apply. */
export function refuseUnappliedPropDefaults(ir: ComponentIR, sink: UnappliedPropDefaultSink): void {
  const { defaults } = appliedPropDefaults(ir.metadata)
  if (![...defaults.values()].some(d => d.blocked.length > 0)) return
  const read = propsReadFrom(ir, defaults)
  // A component renders on the server whatever directive its prop carries.
  const readByChild = propsReadFrom(ir, defaults, position => position.role === 'prop')
  for (const param of ir.metadata.propsParams) {
    const blocked = read.has(param.name) ? defaults.get(param.name)!.blocked : []
    if (blocked.length === 0) continue
    const names = blocked.map(name => `'${name}'`).join(', ')
    const deferrable = !readByChild.has(param.name)
    sink.errors.push({
      code: 'BF101',
      severity: 'error',
      message:
        `The default of prop '${param.name}' reads ${names}, which no template can compute when it applies the default: ` +
        `only a prop, or a 'const' or a function returning one expression that reads no signal, memo, 'let' or reassigned ` +
        `value, is read there. The server render would show '${param.name}' empty where JS shows the default.`,
      // A body destructure's own binding, or the component for a parameter default.
      loc: defaults.get(param.name)!.loc ?? ir.root.loc,
      suggestion: deferrable
        ? {
            message: `Compute the default from props and consts only, or defer the reads of '${param.name}' to the client with /* @client */.`,
            escape: [{ kind: 'client-directive' }],
          }
        : { message: `Compute the default from props and consts only.` },
    })
  }
}

/**
 * The props with a computed default that the server render reads, starting
 * from the positions `startsAt` keeps (every position when unset): in a
 * position, through a declaration it reads, or through another such prop's
 * default.
 */
function propsReadFrom(
  ir: ComponentIR,
  defaults: PropDefaultApplication['defaults'],
  startsAt?: ServerReadWalkOptions['startsAt'],
): ReadonlySet<string> {
  const read = new Set<string>()
  const pending: string[] = []
  const visitProp = (name: string): void => {
    if (read.has(name) || !defaults.has(name)) return
    read.add(name)
    pending.push(name)
  }
  walkServerReads(ir, () => {}, { visitProp, startsAt })
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    for (const free of freeIdentifiers(defaults.get(name)!.expr) ?? []) visitProp(free)
  }
  return read
}
