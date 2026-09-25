/**
 * Settlement helpers shared by `createQuery` (#3157) and `createMutation`
 * (#3200) — the "only descriptors in v0" check and rejection normalization,
 * factored out so the two factories don't each carry their own copy of the
 * same decision (spec/async.md §7.2, §7's "one decision, two
 * implementations" rule in CLAUDE.md).
 */

import { isHttpDescriptor, type HttpDescriptor } from './http.ts'

/**
 * Assert that `value` — a request function's return value — is an `http`
 * descriptor, and narrow to it. Throws synchronously, naming `factoryName`,
 * otherwise: a bare Promise or other async value is not a supported request
 * source in v0 (spec/async.md §7.2).
 */
export function assertHttpDescriptor<T>(
  value: unknown,
  factoryName: 'createQuery' | 'createMutation',
): HttpDescriptor<T> {
  if (!isHttpDescriptor(value)) {
    throw new Error(
      `${factoryName}: the request function must return an \`http\` request descriptor ` +
        '(http.get/query/head/post/put/patch/delete(...) from "@barefootjs/client"). ' +
        'A bare Promise or other async value is not a supported request source in v0 ' +
        '— see spec/async.md §7.2.',
    )
  }
  return value as HttpDescriptor<T>
}

/**
 * Normalize a rejection reason to a real `Error`. Some fetch polyfills /
 * embedded runtimes reject with a plain, non-`Error` value, but `error()`'s
 * documented type on both factories is `HttpError | Error`.
 */
export function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}
