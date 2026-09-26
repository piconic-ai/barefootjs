/**
 * Async layer 0 (spec/async.md §7) as one physical module, published at the
 * `@barefootjs/client/async` subpath.
 *
 * `create-query.ts` keeps module-level state — the query cache, the in-flight
 * map, the live-query registry, and the one invalidation subscription it
 * registers when it loads — and `HttpError` is checked with `instanceof`.
 * Both are only correct if every entry a page imports resolves to the same
 * copy. The main entry and `/runtime` are bundled separately, so each
 * re-exports from this subpath (external to both builds, like
 * `@barefootjs/client/reactive`) rather than bundling its own copy.
 */

export {
  http,
  HttpError,
  type HttpDescriptor,
  type HttpParams,
  type HttpParamValue,
  type HttpInit,
  type HttpMethod,
} from './http.ts'

export {
  createQuery,
  type CreateQueryOptions,
  type QueryAction,
} from './create-query.ts'
