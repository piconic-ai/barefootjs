---
"@barefootjs/pebble": minor
---

Adds `packages/adapter-pebble`'s Phase 1 package skeleton (#2101): a new BarefootJS backend adapter targeting the [Pebble](https://pebbletemplates.io/) template engine for the JVM ecosystem (Spring Boot, Ktor, plain Servlet apps).

This PR only lands the package structure and a `PebbleAdapter` that type-checks against the `TemplateAdapter` interface — its render methods, the Java rendering runtime, and the conformance suite land in follow-up PRs stacked on this one. See the package README's "Design decisions" section for the Phase 0 scoping decisions this stack builds on.
