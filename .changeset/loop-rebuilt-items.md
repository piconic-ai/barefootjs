---
"@barefootjs/client": minor
---

Keyed loops (`mapArray`, `mapArrayAnchored`, `mapArrayLazy`) no longer update a row whose new item is equal to its current one, where before any new object counted as a change. Equal means `Object.is`, or two arrays / two plain objects whose own values are `Object.is`-equal one level down. Nested objects, class instances, dates and functions still compare by reference. So data that is rebuilt rather than mutated (parsed again, mapped from another array, deserialized) reconciles like data that kept its references, and only the rows that really changed re-run their effects.

A row whose item compares equal keeps its previous reference, so code that compares a row's item by identity with an object from the new array now sees the old one. The lazy reconciler's re-subscribe seam follows the same rule: a rebuilt but equal item no longer re-runs `applyOuter`.
