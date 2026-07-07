---
"@barefootjs/mojolicious": patch
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

Fix the Mojo scaffold's stock `/` route 500ing with `Global symbol "$initial" requires explicit package name` (#2126):

- `Mojolicious::Plugin::BarefootJS` now resolves the build manifest lazily per render (cached on the file's mtime/size) instead of once at plugin-register time. The scaffold's dev script starts `bf build --watch` and morbo concurrently, so the app routinely boots before the first build writes `dist/templates/manifest.json` — previously that startup race disabled ssrDefaults stash seeding for the server's lifetime and every top-level render died under strict. Rebuilt manifests (`bf build --watch`, `bf add`) are now also picked up without a server restart.
- `extractSsrDefaults` seeds every prop declared on a bare-props parameter's type (`function Foo(props: Props)`), not just the ones a signal/memo initializer references. Template-stash adapters flatten `props.X` to a bare scalar (`$X`), so a direct template read of an unseeded, unpassed prop was a strict-mode compile error rather than a soft `undef`.
- The mojo scaffold's `/` route now passes `initial => 0` explicitly, keeping the starter page self-sufficient and doubling as the worked example of how props reach a component (they're stash values).
