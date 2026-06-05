---
"@barefootjs/perl": minor
"@barefootjs/mojolicious": minor
---

Add `BarefootJS::DevReload` — framework-agnostic dev browser auto-reload. The
shared module provides the browser snippet, the `<dist>/.dev/build-id` reader,
and a ready-made PSGI streaming app (`->to_app`) for the SSE endpoint, so plain
PSGI/Plack hosts (e.g. the Text::Xslate backend) get the same `barefoot build
--watch` auto-reload as Mojolicious. `Mojolicious::Plugin::BarefootJS::DevReload`
now delegates its snippet and build-id logic to the shared module (no behaviour
change).
