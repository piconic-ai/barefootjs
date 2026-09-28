---
"@barefootjs/client": minor
---

Loops (`mapArray`, `mapArrayAnchored`, `mapArrayLazy`) no longer re-run a row whose new item is equal to its current one, where before any new object counted as a change. This applies to keyed loops and to loops without a key, which key rows by index. Equal means `Object.is`, or two arrays / two plain objects whose own values are `Object.is`-equal one level down. Nested objects, class instances, dates and functions still compare by reference. So data that is rebuilt rather than mutated (parsed again, mapped from another array, deserialized) reconciles like data that kept its references, and only the rows that really changed re-run their effects.

The row still takes the new object as its item, without running anything. So it always holds the array's own object, and identity-based code such as `setTodos(todos().filter((t) => t !== todo))` keeps working after an equal rebuild. The lazy reconciler's re-subscribe seam follows the same rule: a rebuilt but equal item no longer re-runs `applyOuter`.
