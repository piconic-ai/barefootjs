---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
---

Add profile-mode turn-boundary markers around event handlers (#1690, SR3).

The runtime gains `beginTurn(handlerId, loc?)` / `endTurn()` (and the matching
`turnBegin`/`turnEnd` sink hooks). In profile mode the client-JS codegen wraps
each event handler so the reactive work it triggers is attributed to one turn:

```js
_el.addEventListener('click',
  (...__bfa) => { beginTurn("Counter#handler:s0:click"); try { return (HANDLER)(...__bfa) } finally { endTurn() } })
```

A single `wrapHandlerForTurn` helper produces the wrapper, and `beginTurn`/
`endTurn` are registered as runtime imports so the import line is auto-wired.

Measurement-only: the handler's behavior and `set()`'s synchronous semantics
are unchanged. Off by default the emitted code carries no markers and no turn
import (SR8). This PR wraps the top-level handler path; the delegation / branch
/ loop-child handler paths are wrapped in a follow-up.
