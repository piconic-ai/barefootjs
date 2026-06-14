/**
 * `searchParams()` — a reactive read of the URL query string.
 *
 * The first member of the "environment signal" family: an island reads it
 * inside a memo/effect and re-renders fine-grained when the query changes —
 * driven by the router (a same-route query navigation) or by back/forward —
 * **without a full navigation / outlet swap**. This turns a URL-bearing,
 * data-only change (sort/filter/paginate/search) into a plain reactive
 * update.
 *
 * It is a pure-runtime primitive (no new compiler feature). The accessor is
 * branded `Reactive<…>`, so the *existing* compiler reactivity analysis
 * wires the island's DOM updates automatically — same mechanism as signals
 * and memos (see `spec/compiler.md`, "The `Reactive<T>` Brand").
 *
 * Lives behind `@barefootjs/router/signals` (it requires `@barefootjs/client`
 * for reactivity, unlike the client-optional router core), and exposes
 * `window.__bf_set_search` so the router core can drive it without importing
 * this module.
 *
 * SSR note: both server and client read the *same* source (the request URL
 * ↔ `location`), so the value agrees across hydration with no flash and no
 * seed-passing. On the server (no `window`) the initial value is `''`; an
 * adapter-side SSR impl that reads the request is a follow-up.
 */
import { createSignal, type Reactive } from '@barefootjs/client/reactive'

const [searchString, setSearchString] = createSignal(
  typeof window !== 'undefined' ? window.location.search : '',
)

/**
 * Reactive accessor for the current URL search params. Reading it tracks the
 * query, so a memo/effect re-runs when it changes.
 */
export const searchParams = (() => new URLSearchParams(searchString())) as Reactive<
  () => URLSearchParams
>

/**
 * Update the reactive source. Idempotent (no-op if unchanged). Called by the
 * router on a query navigation; also wired to `popstate` below so back/forward
 * updates it even for a navigation the router didn't initiate.
 */
export function setSearch(search: string): void {
  if (searchString() !== search) setSearchString(search)
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __bf_set_search?: (s: string) => void }).__bf_set_search = setSearch
  window.addEventListener('popstate', () => setSearch(window.location.search))
}
