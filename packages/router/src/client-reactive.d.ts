/**
 * The router's optional signals entry point only needs this narrow slice of
 * `@barefootjs/client/reactive`.
 *
 * Keep the declaration local so `@barefootjs/router` can emit its own types
 * from a clean checkout without requiring the optional peer to be built first.
 */
declare module '@barefootjs/client/reactive' {
  export function createSignal<T>(initialValue: T): [
    getter: () => T,
    setter: (value: T | ((previous: T) => T)) => void,
  ]
}
