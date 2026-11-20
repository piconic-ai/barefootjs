/**
 * Which of a child's constructor-derived fields a prop feeds.
 *
 * `New<Child>Props` computes a `createSignal` seed and a `createMemo` body
 * once, from the Input it is handed (`childDerivedFieldDeps`, #2448), so a
 * value that reaches the child after construction is never seen by them.
 */

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
