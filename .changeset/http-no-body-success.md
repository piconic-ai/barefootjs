---
"@barefootjs/client": patch
---

A `createQuery` / `createMutation` request whose successful response has an empty (or whitespace-only) body now resolves to `undefined` instead of rejecting, whatever the method. That covers `204 No Content`, `205 Reset Content`, and a bare 2xx, as `HEAD` already did. Before, such a response was parsed with `response.json()` and rejected, so a mutation against a REST `DELETE` answering `204` reported an error and never ran its `invalidates`. A non-empty body that is not JSON still rejects.
