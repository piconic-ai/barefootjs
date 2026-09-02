---
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
---

Fix a latent SSR-emission bug in the per-item start marker for multi-root Fragment loop bodies (#1212): both adapters called `bfComment('bf-loop-i')` / `` {{bfComment "bf-loop-i"}} `` even though `bfComment` itself already prepends `bf-`, doubling the prefix to `<!--bf-bf-loop-i-->` instead of the correct `<!--bf-loop-i-->` the client runtime and every other adapter's whole-item-conditional anchor (`bf-loop-i:KEY`) already use. No prior fixture exercised `bodyIsMultiRoot` on either adapter, so this went unexercised until #2763's fragment-bodied-keyed-loop fixture was the first to combine a multi-root Fragment row with an SSR render on these adapters, surfacing it as a byte-for-byte `expectedHtml` mismatch.
