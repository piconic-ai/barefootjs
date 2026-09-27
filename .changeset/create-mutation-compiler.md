---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
"@barefootjs/hono": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
---

Export `createMutation` (with `MutationAction` and `CreateMutationOptions`) from `@barefootjs/client`, and compile it. This is the first release that exports it. `const [saved, save] = createMutation(fn, { invalidates })` is recognised as a reactive factory, the same way as `createQuery`:

- `saved()` is seeded `undefined` on the server on every adapter. A mutation has no `initial`, and passing one is refused with the new BF118, which names `createQuery` as the factory that takes it.
- The request function is emitted into client JS only, as the call's own argument, with prop reads kept live. It is never evaluated on the server and never wrapped in anything that tracks. `invalidates` passes through unchanged.
- `save.isPending()` and `save.error()` are seeded through the same gate as a query action's. The gate now also admits `isPending()` in an HTML boolean attribute on an intrinsic element, so `disabled={save.isPending()}` renders the enabled button on every adapter. This applies to a `createQuery` action too.
- A destructure with more than two elements, or a third argument, is refused with BF115 / BF116, as for `createQuery`.

`createMutation`, `MutationAction` and `CreateMutationOptions` live in the `@barefootjs/client/async` subpath next to `createQuery`, re-exported by the main entry and `/runtime`. The Hono SSR shim exports a `createMutation` stub.

ERB and Mojolicious now lower a dynamic HTML boolean attribute from the IR's pre-parsed expression tree instead of re-parsing its raw source text, so a seeded accessor reaches their output there too.
