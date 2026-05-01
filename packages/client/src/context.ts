/**
 * Context API: pure metadata portion.
 *
 * `createContext` is DOM-free and safe to use anywhere (including SSR).
 * The DOM-bound operations (`useContext`, `provideContext`) live in
 * `./runtime/context.ts` and are emitted by the compiler for `'use client'`
 * components.
 */

export type Context<T> = {
  readonly id: symbol
  readonly defaultValue: T | undefined
  /** JSX Provider component. Compiled to provideContext() by the compiler. */
  readonly Provider: (props: { value: T; children?: unknown }) => unknown
}

/**
 * Create a new context with an optional default value.
 *
 * `useContext()` returns the nearest provider value, then the default,
 * then `undefined`. It never throws — guard with optional chaining.
 */
export function createContext<T>(defaultValue?: T): Context<T> {
  return {
    id: Symbol(),
    defaultValue,
    // Provider is compiled away by the JSX compiler into provideContext() calls.
    // This runtime stub exists only for TypeScript type checking.
    Provider: (() => {
      throw new Error('Context.Provider should be compiled away')
    }) as Context<T>['Provider'],
  }
}
