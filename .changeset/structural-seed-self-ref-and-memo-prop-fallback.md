---
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

Two decisions no longer scan text. The Xslate adapter decides whether a derived memo's seed reads its own name (#2679) from the Kolon variables the expression emitter reads, instead of matching `$<name>` in the rendered Kolon. The Go adapter matches a memo's `props.X ?? <literal>` fallback on the memo's parsed tree, instead of a regex over its body text. Compiled output is unchanged.
