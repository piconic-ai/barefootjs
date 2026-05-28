---
"@barefootjs/test": patch
---

`TestNode#on()` now returns `undefined` (instead of `null`) for unwired events, matching the `onClick`/`onInput`/`onChange`/`onSubmit` shorthand getters — so a single matcher (`toBeUndefined()`) covers either accessor. Also documents that `EventHandler.setters`/`via` resolve only raw signal setters declared in the component and stay empty for library property-access handlers (e.g. `@barefootjs/form`'s `name.handleInput`, `form.handleSubmit`).
