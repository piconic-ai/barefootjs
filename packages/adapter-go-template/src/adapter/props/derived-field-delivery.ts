/**
 * Which of a child's constructor-derived fields a prop feeds, and the refusal
 * for a prop that reaches the child only when the template executes.
 *
 * `New<Child>Props` computes a `createSignal` seed and a `createMemo` body
 * once, from the Input it is handed (`childDerivedFieldDeps`, #2448). A value
 * that reaches the child later, at template execute time — JSX children or a
 * JSX-valued prop rendered through a companion define and set on the built
 * Props by `bf_with_children` / `bf_with_props` — is never seen by that
 * computation, so the derived field keeps the value it had without the prop
 * (`createSignal(props.children ?? 'missing')` renders `missing`, #3961).
 */

import type { SourceLocation } from '@barefootjs/jsx'
import type { CompileState } from '../lib/compile-state.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * The first of a child's constructor-derived fields that reads the prop the
 * caller writes as `propName`, or undefined. `derived` is keyed by the
 * child's field and lists the caller-facing Input fields it reads.
 */
export function derivedFieldReading(
  derived: ReadonlyMap<string, ReadonlySet<string>> | undefined,
  propName: string,
): string | undefined {
  if (!derived) return undefined
  const field = capitalizeFieldName(propName)
  return [...derived].find(([, deps]) => deps.has(field))?.[0]
}

/**
 * BF101 when `propName` (`children` or a JSX-valued prop) is delivered to
 * `<childName>` at template execute time and one of the child's
 * constructor-derived fields reads it. Returns whether it refused.
 */
export function refuseTemplateTimeDeliveryToDerivedField(
  state: Pick<CompileState, 'errors'>,
  childName: string,
  derived: ReadonlyMap<string, ReadonlySet<string>> | undefined,
  propName: string,
  loc: SourceLocation,
): boolean {
  const field = derivedFieldReading(derived, propName)
  if (field === undefined) return false
  const isChildren = propName === 'children'
  const what = isChildren ? 'its children' : `its '${propName}' prop`
  const value = isChildren ? 'these children' : `this '${propName}' value`
  state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `<${childName}>'s '${field}' is computed from ${what} when <${childName}>'s props are constructed, but the Go template adapter renders ${value} only when the template executes, after that computation, so '${field}' would be computed as if ${what} were absent.`,
    loc,
    suggestion: {
      message: isChildren
        ? `Render \`props.children\` in <${childName}> directly instead of computing state from it, or pass <${childName}> static text children outside a loop row.`
        : `Render \`props.${propName}\` in <${childName}> directly instead of computing state from it, or pass <${childName}> a '${propName}' value that is not JSX.`,
    },
  })
  return true
}
