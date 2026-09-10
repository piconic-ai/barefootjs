---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Follow-up to #2898's static-loop-conditional fix, found during code review: `elementAttrEmitter`'s boolean-HTML-attribute path (`disabled`, `checked`, `hidden`, etc.) also routes through the same `convertConditionToGo` method #2898 taught to consult `staticLoopItemStack` — so an item-bound boolean attribute (`disabled={item.disabled}`) inside a Go template adapter's per-item unrolled static loop row, previously a silent divergence with no test coverage, is now also fixed and pinned with a regression fixture (`static-loop-item-boolean-attr`). That fixture surfaces the same pre-existing Mojolicious/Xslate boolean-in-static-array limitation #2911 already tracks, pinned identically to `static-loop-item-conditional`.
