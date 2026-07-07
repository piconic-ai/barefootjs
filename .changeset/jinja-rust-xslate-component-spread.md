---
"@barefootjs/jinja": minor
"@barefootjs/rust": minor
"@barefootjs/xslate": minor
---

Lower `{...props}` component-spread props on the Jinja, MiniJinja, and Xslate adapters instead of refusing them with BF101 — porting the segment-based fold the Twig adapter shipped with previously.

Jinja and MiniJinja have no dict-splat syntax that flattens past a single `**` per call (CPython's `dict()` builtin raises `TemplateSyntaxError` on more than one `**` argument), so `renderComponent` now builds each child's props dict as an ordered sequence of segments — literal `{'k': v, ...}` dict entries and spread expressions — and folds them into one expression via NESTED `dict(base, **top)` calls, later segment winning on key conflict (matching JSX's `{...a, ...b}` / `Object.assign` semantics). A spread operand is wrapped `(EXPR or {})` before unpacking: `**`-unpacking an undefined/none bag raises even though Jinja's `ChainableUndefined` (Python) / `UndefinedBehavior::Chainable` (minijinja) tolerate chained member access on it, so the `or {}` guard normalises a missing bag (e.g. `children.props` when `children` was never passed) to an empty dict first. Verified against real jinja2 3.1.6 (Python) and the minijinja crate v2 (Rust).

Xslate's Kolon dialect has no hash-splat syntax at all (`%$hash`-into-hashref-literal is a parse error), so its `renderComponent` instead folds the same ordered segments via chained `.merge(...)` calls — Kolon's builtin hash method, later argument wins. A spread operand is wrapped `(EXPR // {})`: `.merge(undef)` warns "Merging value is not a HASH reference" on real Text::Xslate 3.5.9, so the defined-or guard is required.

This unblocks the site/ui `Slot` polymorphism pattern (`<Slot className={classes} {...props}>`) used by `badge`, `breadcrumb`, `button`, `button-group`, `icon`, `item`, `kbd`, and `slot` itself, all of which previously failed to compile on these three adapters. The `button` and `kbd` pins in each package's `conformance-pins.ts` graduate from an expected-BF101 diagnostic contract to real rendered-HTML conformance.
