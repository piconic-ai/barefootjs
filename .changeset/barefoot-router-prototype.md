---
"@barefootjs/router": minor
"@barefootjs/shared": minor
---

Add `@barefootjs/router`: a minimal partial-navigation client router that swaps only the `[bf-outlet]` content region on same-origin link navigation and re-hydrates the islands inside it, leaving the surrounding shell mounted. Backend cooperation is optional (full-page responses are extracted client-side; a backend honouring the `X-Barefoot-Navigate` header may return just the fragment). Adds `BF_OUTLET` and `BF_NAVIGATE_HEADER` markers to `@barefootjs/shared`.
