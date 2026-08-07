---
"@barefootjs/cli": patch
---

Adapters that inject a `package.json` dependency override (currently
only the Hono adapter's `undici` override — see the previous release
note) now also surface a "Dependency overrides" section in the
scaffolded README explaining why the override exists and when it's
safe to remove. `package.json` can't carry a comment, so without this
the override was undiscoverable to whoever ends up maintaining the
generated project.
