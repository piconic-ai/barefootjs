---
"@barefootjs/jsx": minor
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/php": patch
"@barefootjs/perl": patch
"@barefootjs/rust": patch
---

Add #2274: a `date` catalogue entry lowering a zero-arg `Date.prototype` method call on a `Date`-typed prop (`createdAt.toISOString()`, `updatedAt.getUTCFullYear()`, …) to a backend-neutral `helper-call` LoweringNode instead of refusing it as an uncatalogued rich-type method call (#2273's `checkRichTypeMethodCalls` now exempts it).

- `@barefootjs/jsx`: `date-lowering.ts` registers the `date` builtin lowering plugin recognizing `getUTCFullYear` / `getUTCMonth` / `getUTCDate` / `getUTCHours` / `getUTCMinutes` / `getUTCSeconds` / `getTime` / `toISOString`; the analyzer widens a destructured `Date`-typed prop's rich-type evidence so the plugin (and the #2273 refusal) can see through the destructure.
- `@barefootjs/go-template`, `@barefootjs/erb`, `@barefootjs/jinja`, `@barefootjs/php`, `@barefootjs/perl`, `@barefootjs/rust`: each runtime gains a `date(recv, op)` helper (`bf_date` / `bf.date` / `BarefootJS::Date` / `barefootjs.date`) accepting either the backend's own native date/time value or an ISO-8601 string, normalizing both to the same instant before dispatching `op` — pinned against the JS-normative golden vectors (epoch 0, a pre-1970 instant, a leap day, and the four-digit-year boundary). `getUTCMonth` is 0-based, matching JS; every accessor and `getTime` render as an integer; `toISOString` always renders millisecond precision, UTC.

The Rust runtime additionally gains a hand-rolled proleptic-Gregorian calendar (`date.rs`, Hinnant's `civil_from_days`/`days_from_civil`) and a `JsValue::Date`/`minijinja::Value` native receiver shape — no new crate dependency.
