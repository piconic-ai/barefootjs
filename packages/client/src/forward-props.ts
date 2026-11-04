/**
 * BarefootJS - Forward Props Helper
 *
 * Forwards spread props to child components using getter delegation
 * to preserve reactivity. Used by compiler-generated code for
 * components with {...rest} spread on child components.
 */

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
 * An object part holds the call's explicit props; its getters stay getters.
 * A function part is a spread of an arbitrary object (`<Chip {...row} />`),
 * read again on every access, so the child sees a later value of the
 * spread object (a loop row accessor, a prop that holds an object) the way
 * it sees an explicit prop.
 *
 * Every read resolves live, from the last part to the first:
 * - an object part owns each of its own keys;
 * - a function part owns a key only while its current value is non-null
 *   and has that key as an own enumerable property (what `{...value}`
 *   copies). A key present with the value `undefined` still overrides.
 *
 * So when a spread drops a key, an earlier explicit prop for it shows
 * again (`<Chip tone="base" {...row()} />` with `row()` going from
 * `{ tone: 'red' }` to `{}` reads `'base'`), and a key the spread gains
 * later reaches the child. `ownKeys` and `in` are live in the same way.
 * Reads inside an effect track the spread thunks they call, as an
 * explicit prop's getter tracks its signals.
 *
 * Nothing runs when this is called. A call site evaluates its props object
 * even when the child does not exist: `initChild` with a null scope (the
 * component took another early-return branch), or a dynamic tag
 * (`<Tag {...children.props} />`) that never registers. Calling a spread
 * thunk there evaluated an expression the source only evaluates inside its
 * branch, such as `children.props` with no `children` at hydration.
 *
 * A write to the result (`set`, `defineProperty`, `delete`) goes to a layer
 * above every part.
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
  // Writes made through the result: the top layer.
  const own: Record<PropertyKey, unknown> = {}
  const layers = (): Record<PropertyKey, unknown>[] => [own, ...currentLayers(parts)]
  const owner = (key: PropertyKey) => layers().find(layer => ownsKey(layer, key))
  return new Proxy({} as Record<string, unknown>, {
    get: (_, key) => owner(key)?.[key as string],
    has: (_, key) => owner(key) !== undefined,
    ownKeys: () => mergedKeys(layers()),
    getOwnPropertyDescriptor: (_, key) => owner(key) === undefined
      ? undefined
      : { get: () => owner(key)?.[key as string], enumerable: true, configurable: true },
    set: (_, key, value) => Reflect.set(own, key, value),
    defineProperty: (_, key, desc) => Reflect.defineProperty(own, key, { ...desc, configurable: true }),
    deleteProperty: (_, key) => Reflect.deleteProperty(own, key),
  })
}

/** The parts' current objects, last part first; a null spread is skipped. */
function currentLayers(parts: readonly ChildPropsPart[]): Record<PropertyKey, unknown>[] {
  const layers: Record<PropertyKey, unknown>[] = []
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!
    const value = typeof part === 'function' ? part() : part
    if (value !== null && value !== undefined) layers.push(Object(value) as Record<PropertyKey, unknown>)
  }
  return layers
}

/** Whether `layer` supplies `key`: an own enumerable property, as a spread copies. */
function ownsKey(layer: Record<PropertyKey, unknown>, key: PropertyKey): boolean {
  return Object.prototype.propertyIsEnumerable.call(layer, key)
}

/** The merged string keys in source order (first part first), each once. */
function mergedKeys(layers: readonly Record<PropertyKey, unknown>[]): string[] {
  const keys = new Set<string>()
  for (let i = layers.length - 1; i >= 0; i--) {
    for (const key of Object.keys(layers[i]!)) keys.add(key)
  }
  return [...keys]
}
