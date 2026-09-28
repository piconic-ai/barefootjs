---
title: createMutation
description: A value written by an HTTP request that is sent only when its action is called, with pending and error state and cache invalidation on success.
---

# createMutation

Creates a value that a write fills. The request is sent only when the returned action is called, never on its own. Returns `[value, action]`, the same shape as [`createQuery`](./create-query.md).

```ts
import { createMutation, http } from '@barefootjs/client'

const [value, action] = createMutation<T>(
  fn: () => HttpDescriptor<T>,
  options?: { invalidates?: string[] },
)

value()             // T | undefined — the last successful result
action()            // send now; Promise<T>
action.isPending()  // the latest call has not settled
action.error()      // the latest call's error; cleared by the next success
```

```tsx
'use client'
import { createMutation, createSignal, http } from '@barefootjs/client'

type Comment = { id: number; text: string }

export function CommentForm(props: { postId: number }) {
  const [text, setText] = createSignal('')
  const [saved, save] = createMutation(
    () => http.post<Comment>(`/api/posts/${props.postId}/comments`, { text: text() }),
    { invalidates: ['/api/posts'] },
  )
  return (
    <form>
      {save.error() ? <p role="alert">Failed to save</p> : null}
      <input value={text()} onInput={(e) => setText(e.target.value)} />
      <button type="button" disabled={save.isPending()} onClick={() => save()}>
        Post
      </button>
      {saved() ? <p>Saved</p> : null}
    </form>
  )
}
```

## Sent at call time

The request function is evaluated **untracked, when the action is called**. It reads the signals' current values then, and a later change to them sends nothing. Nothing is sent on mount. The function never runs on the server, and on the server `value()` is `undefined`, `isPending()` is `false` and `error()` is `undefined`.

Like `createQuery`, the function must return an `http` descriptor. A success with an empty body, such as a `DELETE` answered with `204 No Content`, resolves the call with `undefined`, sets `value()` to `undefined`, and still invalidates. A safe method (`GET`, `HEAD`, `QUERY`) still sends, but warns once per mutation that a read belongs in `createQuery`.

## Concurrent calls

A mutation has no cache and no deduplication: every call sends its own request, and each call's returned promise settles with its own result. `value()`, `isPending()` and `error()` follow only the **latest** call, so an older call that settles later never overwrites them. `value()` keeps the last successful result across a pending call and a failure.

## `invalidates`

On success, every prefix in `invalidates` marks matching data stale in two caches:

- **The query cache.** Every cached `createQuery` whose URL (with its params, whatever the method) starts with the prefix is marked stale. A live query tracking a matching URL re-sends at once.
- **The router's page cache.** The router cannot tell which pages rendered data from those URLs, so it evicts its whole page cache. A later navigation does not restore HTML rendered before the write.

A failed call invalidates nothing. A call that succeeds after its component was disposed still invalidates, because the write happened on the server.

## Awaiting a call

`action()` returns a promise, so `await save()` before navigating works. A failure rejects that promise and also sets `error()`. The rejection is pre-handled: a fire-and-forget `onClick={() => save()}` reports no unhandled rejection, while a caller that awaits still sees the error.

## Caveats

- There is no `initial`: a mutation has no initial request whose result the server could embed. Passing one is BF118. Use `createQuery` for a value that needs an initial state.
- `isPending()` and `error()` render in the template under the same rules as a query's: in a condition, or `isPending()` in an ARIA boolean-state or HTML boolean attribute (`disabled={save.isPending()}`). Other template reads are BF117.
- Destructure the call as `const [value, action] = createMutation(…)`, `[value]` or `[, action]`. Anything longer, or a third argument, is BF115 / BF116.
- Calling the action after its component is disposed rejects.

See [`spec/async.md`](../../../spec/async.md) §7.4 for the full model.
