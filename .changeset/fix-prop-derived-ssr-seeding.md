---
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

Fix SSR render crash for components whose signal/memo reads an optional prop (`createSignal(props.initial ?? 0)`). The bare-props-arg form now seeds those referenced props into the manifest `ssrDefaults`, so template-stash adapters no longer abort with `Global symbol "$initial" requires explicit package name` at top-level render. The Text::Xslate scaffold's `app.psgi` also seeds each component's `ssrDefaults` from the build manifest (a plain PSGI app has no plugin to do it automatically), so `<: $count :>` and friends resolve.
