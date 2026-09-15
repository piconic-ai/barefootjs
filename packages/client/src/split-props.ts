/**
 * BarefootJS - splitProps
 *
 * SolidJS-compatible utility for splitting a props object into local and rest.
 * Uses Proxy to preserve getter-based reactivity.
 *
 * @example
 * ```tsx
 * import { splitProps } from '@barefootjs/client'
 *
 * function Checkbox(props: CheckboxProps) {
 *   const [local, rest] = splitProps(props, ['checked', 'onCheckedChange'])
 *   return <button {...rest} aria-checked={local.checked} />
 * }
 * ```
 */

/**
 * Split a props object into two: one with the specified keys, one with the rest.
 * Both returned objects use Proxy to defer reads, preserving reactive tracking.
 *
 * @param props - The source props object
 * @param keys - Keys to extract into the first (local) object
 * @returns A tuple [local, rest] where local has the specified keys and rest has everything else
 *
 * @since 0.1.0
 * @stability beta
 */
export function splitProps<
  T extends Record<string, unknown>,
  K extends (keyof T)[]
>(
  props: T,
  keys: K
): [Pick<T, K[number]>, Omit<T, K[number]>] {
  const keySet = new Set<string | symbol>(keys as (string | symbol)[])

  const local = new Proxy({} as Pick<T, K[number]>, {
    get(_, key) {
      if (keySet.has(key)) {
        return (props as Record<string | symbol, unknown>)[key]
      }
      return undefined
    },
    has(_, key) {
      return keySet.has(key)
    },
    ownKeys() {
      return [...keySet] as string[]
    },
    getOwnPropertyDescriptor(_, key) {
      if (keySet.has(key)) {
        return {
          configurable: true,
          enumerable: true,
          get: () => (props as Record<string | symbol, unknown>)[key],
        }
      }
      return undefined
    },
  })

  const rest = new Proxy({} as Omit<T, K[number]>, {
    get(_, key) {
      if (!keySet.has(key)) {
        return (props as Record<string | symbol, unknown>)[key]
      }
      return undefined
    },
    has(_, key) {
      return key in props && !keySet.has(key)
    },
    ownKeys() {
      return Object.keys(props).filter(k => !keySet.has(k))
    },
    getOwnPropertyDescriptor(_, key) {
      if (key in props && !keySet.has(key)) {
        return {
          configurable: true,
          enumerable: true,
          get: () => (props as Record<string | symbol, unknown>)[key],
        }
      }
      return undefined
    },
  })

  return [local, rest]
}
