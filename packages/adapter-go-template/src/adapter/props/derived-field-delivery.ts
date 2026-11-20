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

import type { IRComponent, IRProp, ParsedExpr, SourceLocation } from '@barefootjs/jsx'
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

/**
 * The prop a constructor-derived field named like one of the child's props
 * passes through unchanged (`const [children] = createSignal(props.children)`,
 * optionally with a `??` fallback), or null when the initializer transforms
 * what it reads (`props.children + '!'`). Such a field shares the prop's own
 * Props field, so a value set on that field after construction is what the
 * field holds: a passthrough stays right, a transformation is lost. A `??`
 * fallback applies only to an absent prop, and a value delivered after
 * construction is never absent. `readName` maps the read to the prop's
 * caller-facing field.
 */
export function passthroughReadField(
  init: ParsedExpr,
  propsObjectName: string | null,
  readName: (name: string) => string,
): string | null {
  let e = init
  while (e.kind === 'logical' && e.op === '??') e = e.left
  if (e.kind === 'identifier') return propsObjectName ? null : readName(e.name)
  if (
    e.kind === 'member' && propsObjectName && !e.computed && !e.optional &&
    e.object.kind === 'identifier' && e.object.name === propsObjectName
  ) {
    return readName(e.property)
  }
  return null
}

/**
 * BF101 for a JSX-valued prop other than `children` on a component in a
 * loop row (nested in the row's element, or the row itself) whose value no
 * static bake turns into a constant: the Go template adapter has no per-row
 * delivery for it, so the child would render without it. A
 * `/* @client *\/` prop is the escape and is left to the client. Returns
 * whether it refused.
 */
export function refuseUndeliveredLoopRowJsxProp(
  state: Pick<CompileState, 'errors'>,
  comp: Pick<IRComponent, 'name'>,
  prop: IRProp,
): boolean {
  if (prop.value.kind !== 'jsx-children' || prop.name === 'children' || prop.clientOnly) return false
  state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `'${prop.name}' on <${comp.name}> is JSX the Go template adapter can't render ahead of time, and it has no per-row delivery for a JSX prop of a component in a loop row, so <${comp.name}> would render without it.`,
    loc: prop.loc,
    suggestion: {
      message: `Pass <${comp.name}> the row's data as a plain prop and build the JSX inside <${comp.name}>, or pass the JSX as its children.`,
    },
  })
  return true
}
