/**
 * Guard for `virtualComponentPath` (#3220): fails loudly when the harness
 * can no longer resolve `@barefootjs/client`'s published types from the
 * path every conformance call site now compiles at.
 *
 * Without this guard, a checkout where `@barefootjs/client` hasn't been
 * built (or a future refactor that moves `virtualComponentPath`'s anchor
 * out from under a `node_modules` that resolves `@barefootjs/*`) would
 * silently regress every caller back to the pre-#3220 behaviour — every
 * `Reactive<T>` accessor read degrades to `any`, matching whatever the
 * unresolved answer happens to render, with no red test anywhere in the
 * suite to say so.
 */
import { describe, expect, test } from 'bun:test'
import ts from 'typescript'
import { createProgramForFile } from '@barefootjs/jsx'
import { virtualComponentPath } from '../virtual-path'

describe('virtualComponentPath resolves @barefootjs/client types', () => {
  test('a Reactive<T> accessor read is seen as its real type, not `any`', () => {
    const source = `
import { createQuery } from '@barefootjs/client'

export function Probe() {
  const [, fetchProbe] = createQuery(async () => 0, { initial: 0 })
  return <div>{fetchProbe.isPending()}</div>
}
`
    const result = createProgramForFile(source, virtualComponentPath())
    expect(result).not.toBeNull()
    if (!result) return

    let sawCall = false
    let typeAtCall = ''
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'isPending'
      ) {
        sawCall = true
        typeAtCall = result.checker.typeToString(result.checker.getTypeAtLocation(node))
      }
      ts.forEachChild(node, visit)
    }
    visit(result.sourceFile)

    expect(sawCall).toBe(true)
    // The unresolved (repo-root-`cwd`) failure mode types this `any` —
    // asserting the concrete `boolean` is what actually distinguishes
    // "the brand resolved" from "TypeScript gave up and shrugged".
    expect(typeAtCall).toBe('boolean')
  })
})
