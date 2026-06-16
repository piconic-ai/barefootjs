/**
 * Compiler built-in JSX tags: `<Async>` and `<Region>`.
 *
 * These are recognised by the BarefootJS compiler **structurally** — by
 * their import from `@barefootjs/client` (`ir.metadata.imports`), never by
 * a bare capitalized tag-name match — and are compiled away: `<Async>`
 * lowers to a streaming boundary (e.g. Hono `<Suspense>`) and `<Region>`
 * lowers to a `bf-region` page-lifecycle boundary (spec/router.md). No
 * runtime value survives in the emitted output; the compiler also elides
 * the import on emit so it never lingers as a phantom runtime import.
 *
 * The real exports here exist so authors can `import { Async, Region }`
 * with full prop-checking and completion, the same way Solid imports
 * `<Show>` / `<Suspense>` from `solid-js`. Importing them is what tells the
 * compiler the tag is the built-in (and keeps a user's own `<Async>` /
 * `<Region>` component from colliding with it).
 *
 * If one of these ever executes, the JSX was rendered outside the
 * BarefootJS compiler pipeline — that's a bug. See
 * piconic-ai/barefootjs#1915.
 */

function compiledAway(name: string): never {
  throw new Error(
    `[barefootjs] <${name}> is a compiler built-in and is compiled away. ` +
      `If you are seeing this at runtime, the JSX was rendered without going ` +
      `through the BarefootJS compiler — please report a bug.`,
  )
}

export interface AsyncProps {
  /** UI rendered while the streamed children resolve. */
  fallback: unknown
  /** Content streamed in once resolved. */
  children?: unknown
}

export interface RegionProps {
  /** The page-lifecycle subtree the router disposes / re-hydrates on navigation. */
  children?: unknown
}

/**
 * Streaming async boundary. Lowered by the compiler to the adapter's
 * streaming primitive (Hono `<Suspense>`); `fallback` is shown until the
 * children resolve. Compiled away — never executes at runtime.
 */
// Return type is `any` so the built-in satisfies every adapter's
// `JSX.Element` regardless of the active `jsxImportSource`.
export function Async(_props: AsyncProps): any {
  return compiledAway('Async')
}

/**
 * Page-lifecycle boundary (spec/router.md). Lowered by the compiler to a
 * wrapper element carrying a deterministic `bf-region` marker the client
 * router matches on. Compiled away — never executes at runtime.
 */
// Return type is `any` so the built-in satisfies every adapter's
// `JSX.Element` regardless of the active `jsxImportSource`.
export function Region(_props: RegionProps): any {
  return compiledAway('Region')
}
