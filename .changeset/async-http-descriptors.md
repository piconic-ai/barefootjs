---
"@barefootjs/client": minor
---

Add the `http` namespace of request descriptors (`http.get` / `query` / `head` / `post` / `put` / `patch` / `delete`), the first piece of the async data layer in `spec/async.md` §7. Each constructor returns a frozen, pure descriptor and performs no I/O; the response type is carried as a type parameter (`http.get<Post[]>(url)`). A body is sent as JSON by default; a string, `FormData`, `URLSearchParams`, `Blob` or bytes is sent as fetch would send it, and a `Content-Type` in the third argument replaces the default. Every request sends `Accept: application/json, */*;q=0.5` unless the third argument sets its own `Accept`. `HttpError` is exported for non-2xx responses (`{ status, body }`). `createQuery` builds on these in a later release.
