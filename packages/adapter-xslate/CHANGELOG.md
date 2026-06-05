# @barefootjs/xslate

## 0.7.0

### Minor Changes

- 199644e: Add `@barefootjs/xslate` — a Text::Xslate (Kolon) adapter that compiles
  BarefootJS IR to `.tx` templates and ships `BarefootJS::Backend::Xslate`. Because
  the rendering backend is framework-agnostic, it runs under any PSGI/Plack app
  (no Mojolicious required). Validated end-to-end against Text::Xslate 3.5.9 and
  served live via Plack.

  The EP→Kolon mapping is mechanical (`<%= X %>` → `<: X :>`, `<%== X %>` →
  `<: X | mark_raw :>`, `bf->m` → `$bf.m()`), so the engine-agnostic
  `BarefootJS` runtime renders through Xslate unchanged.

  Also generalizes the core `render_child` (in `@barefootjs/perl`) to accept the
  single-hashref call form that Text::Xslate Kolon (and Template Toolkit) method
  calls require, in addition to the existing Mojo list form. Backward-compatible.

### Patch Changes

- Updated dependencies [ac91bc6]
- Updated dependencies [199644e]
  - @barefootjs/perl@0.7.0
  - @barefootjs/shared@0.7.0
