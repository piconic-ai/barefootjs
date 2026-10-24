---
"@barefootjs/go-template": patch
---

Keep an `undefined` element when baking a signal's inline array seed (`createSignal(['a', undefined, 'c'])`). Before, the element made the whole seed defer to `nil`, so the loop rendered no rows; it now bakes as `nil` and renders an empty row, as `null` does. A `key: undefined` property of an object element is treated as an absent key, so the field keeps its Go zero value instead of dropping the seed.
