/**
 * BarefootJS - Forward Props Helper
 *
 * Forwards spread props to child components using getter delegation
 * to preserve reactivity. Used by compiler-generated code for
 * components with {...rest} spread on child components.
 */

import { untrack } from '@barefootjs/client/reactive'

/**
 * Create a props object that merges explicit overrides with forwarded source props.
 * Preserves getter-based reactivity from both overrides and source.
 *
 * Not an authoring API: emitted by the compiler for a `{...rest}` spread on a
 * child component.
 *
 * @example
 * ```tsx
 * // Compiler-generated for `<Button {...rest} class={merged}>`: `class` comes
 * // from the override, everything else is forwarded from `props` by getter, so
 * // the child still sees reactive updates.
 * forwardProps(props, { class: merged }, ['class', 'children'])
 * ```
 *
 * @internal
 */
export function forwardProps<T extends Record<string, unknown>>(
  source: T,
  overrides: Record<string, unknown>,
  excludeKeys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const exclude = new Set(excludeKeys)

  // Copy overrides preserving getter descriptors
  const descs = Object.getOwnPropertyDescriptors(overrides)
  for (const key of Object.keys(descs)) {
    Object.defineProperty(result, key, { ...descs[key], enumerable: true, configurable: true })
  }

  // Forward remaining source props via getters (deferred read = reactive)
  for (const key of Object.keys(source)) {
    if (exclude.has(key) || key in result) continue
    const k = key
    Object.defineProperty(result, k, {
      get: () => (source as Record<string, unknown>)[k],
      enumerable: true,
      configurable: true,
    })
  }

  return result
}

/**
 * One part of {@link spreadChildProps}: an object of explicit props (its
 * getters are kept), or a thunk returning the value of a `{...value}`
 * spread.
 */
export type ChildPropsPart = Record<string, unknown> | (() => unknown)

/**
 * Merge a child component call's props in source order, as the JSX call
 * does: a later part overrides an earlier one, key by key.
 *
 * An object part is copied with its property descriptors, so an explicit
 * prop's getter stays a getter. A function part is a spread of an arbitrary
 * object (`<Chip {...row} />`). Its keys are taken from the value it
 * returns, and each key reads the thunk again through a getter, so the
 * child sees a later value of the spread object (a loop row accessor, a
 * prop that holds an object) the way it sees an explicit prop.
 *
 * The merge runs on the first read of the result, not when this is called.
 * A call site evaluates its props object even when the child does not exist:
 * `initChild` with a null scope (the component took another early-return
 * branch), or a dynamic tag (`<Tag {...children.props} />`) that never
 * registers. Calling a spread thunk there evaluated an expression the
 * source only evaluates inside its branch, such as `children.props` with
 * no `children` at hydration, and the throw stopped the parent's init.
 * The first read is untracked, so taking the keys subscribes no effect.
 *
 * Not an authoring API: emitted by the compiler.
 *
 * @example
 * ```tsx
 * // Compiled from `<Chip tone="a" {...row} label={x()} />`.
 * spreadChildProps({ tone: "a" }, () => row(), { get label() { return x() } })
 * ```
 *
 * @internal
 */
export function spreadChildProps(...parts: ChildPropsPart[]): Record<string, unknown> {
  let merged: Record<string, unknown> | undefined
  const resolve = (): Record<string, unknown> => (merged ??= untrack(() => mergeChildPropsParts(parts)))
  return new Proxy({} as Record<string, unknown>, {
    get: (_, key) => resolve()[key as string],
    set: (_, key, value) => Reflect.set(resolve(), key, value),
    has: (_, key) => key in resolve(),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(resolve(), key),
    defineProperty: (_, key, desc) => Reflect.defineProperty(resolve(), key, { ...desc, configurable: true }),
    deleteProperty: (_, key) => Reflect.deleteProperty(resolve(), key),
  })
}

/** The eager merge behind {@link spreadChildProps}. */
function mergeChildPropsParts(parts: readonly ChildPropsPart[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const part of parts) {
    if (typeof part === 'function') {
      const value = part()
      if (value === null || value === undefined) continue
      for (const key of Object.keys(Object(value))) {
        Object.defineProperty(result, key, {
          get: () => {
            const current = part()
            return current === null || current === undefined ? undefined : (Object(current) as Record<string, unknown>)[key]
          },
          enumerable: true,
          configurable: true,
        })
      }
      continue
    }
    const descs = Object.getOwnPropertyDescriptors(part)
    for (const key of Object.keys(descs)) {
      Object.defineProperty(result, key, { ...descs[key], enumerable: true, configurable: true })
    }
  }
  return result
}
