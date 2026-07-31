---
"@barefootjs/router": patch
---

Mark a region swap in flight with `data-bf-navigating`

A swap commits the incoming markup and only *then* re-hydrates it — and
`defaultRehydrate`'s fallback reaches the runtime through
`await import('@barefootjs/client/runtime')`. So "the element is in the DOM" and
"the element is interactive" are two different moments, separated by a dynamic
import, and nothing observable distinguished them.

The consequence is a lost click. Wait for a swapped-in island to appear, click
it, and on a loaded machine the handler is not attached yet: the event lands on
server markup and vanishes with no error. The `hono` blog e2e was written
exactly that way (`waitForSelector` then `click`) and failed intermittently on
CI while passing locally — the failure looked like a flaky assertion and was
actually this gap.

`data-bf-navigating` on `<html>` now spans the whole swap sequence — dispose,
module load, history, re-hydrate, focus — and is cleared in its `finally`. Only
the CURRENT navigation clears it: a superseded one reaches its `finally` while
the successor is still mid-swap, and clearing there would announce
"interactive" over content still being rebuilt. Query-only navigations return
before the sequence and never set it, because they re-render nothing.

`NAVIGATING_ATTR` is exported so callers need not hard-code the string. Beyond
tests it is the hook a loading indicator wants.
